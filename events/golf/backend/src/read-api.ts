import {
  getState,
  queryGsiPaginated,
  queryGsiAll,
  queryState,
  getNoteStrokes,
  ACTIVITY_GSI2PK,
  type BestItem,
  type CourseStandingItem,
  type PlayItem,
} from './shared';
import { COURSES, resolveVisibleHole, isVisibleCourseSlug, VISIBLE_COURSES } from './courses';
import { parseIdFilter } from './query';
import { getViewer } from './auth';
import {
  buildCourseDetail,
  buildCourseLeaderboard,
  buildPlayerBests,
  buildCoursesIndex,
  buildHoleLeaderboard,
  findVisibleCourse,
  parsePaging,
} from './leaderboards';
import { computeRankings, coursePartitionKey, holePartitionKey } from './rankings';

interface FunctionUrlEvent {
  requestContext: { http: { method: string; path: string } };
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
  rawPath: string;
}

function respond(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * GET /best?userId=X&chartHash=Y - this user's previous best stroke total on this chart.
 *
 * Called by chart.ts's synchronous result-image hook with a short timeout, to show a delta on the
 * result card (see api/src/utils/event-result-images.ts).
 */
async function getBest(params: Record<string, string>) {
  const { userId, chartHash } = params;
  if (!userId || !chartHash) {
    return respond(400, { error: 'userId and chartHash are required' });
  }

  const best = await getState<BestItem>(`USER#${userId}`, `BEST#${chartHash}`);
  return respond(200, { previousBestStrokes: best?.totalStrokes ?? null });
}

const DEFAULT_ACTIVITY_LIMIT = 3;
const MAX_ACTIVITY_LIMIT = 50;
/** Rows pulled per index page while filling a page of results. */
const ACTIVITY_PAGE_SIZE = 100;
/** Hard stop on index pages per request, so a table full of filtered rows can't turn one request
 * into an unbounded walk. Hitting it returns a short page rather than an error - a feed is
 * best-effort by nature. */
const MAX_ACTIVITY_PAGES = 5;

/** A caller can only name this many users at once. Generous next to any real rival list, while
 * keeping the filter bounded and the URL inside CloudFront's limits. */
const MAX_USER_IDS = 100;

/**
 * GET /activity?limit=N&course=<slug>&chartHash=<hash>&userIds=<id,id,...>
 *
 * The most recent play by each of the N most recently active players. Backs the "Currently On
 * Course" panel on the logged-out golf home page.
 *
 * There is no presence signal to work from - a score only exists once a play has finished - so this
 * is simply the latest plays, with no recency window. A quiet event shows older rows rather than an
 * empty panel; the client has the timestamp and can present that however it wants.
 *
 * Optional filters:
 * - `course` - one visible course slug (`beta-hills`, `beta-pines`). Omit for every course. An
 *   unknown or hidden slug is a 400 rather than an empty list, so a typo is reported instead of
 *   looking like a quiet event.
 * - `chartHash` - one hole, by chart hash. Each row is then the player's most recent play on that hole.
 *   Like `course`, an unknown or hidden hash is a 400 rather than an empty list, which also means a
 *   hidden course's chart can't be probed through this path. Combined with `course`, both must match,
 *   so a hash from a different course returns an empty list (a hole is on exactly one course).
 * - `userIds` - comma-separated user ids; only their plays are returned. This is what powers a
 *   "rivals only" toggle: the browser is already authenticated with the core API, so it reads its
 *   own rival list from `GET /rivals` there and passes the ids here.
 *
 *   Named for what it does rather than `rivalsOnly=true`, because this endpoint cannot verify that
 *   the ids really are the caller's rivals - golf has no user table, no auth, and no way to read a
 *   private relationship from core without breaking the isolation boundary. Pretending otherwise
 *   would be a lie in the parameter name. Nothing is leaked by trusting the client here: every row
 *   this returns is already public in the unfiltered feed, so naming arbitrary users only narrows
 *   what you would have been shown anyway.
 *
 * Three filters always apply, and they are why this paginates rather than taking one page:
 *
 * - **One row per player.** Without it the panel is routinely one person's practice session - in
 *   the live table a single player held 4 of the 6 most recent plays.
 * - **Visible courses only.** A chart dropped from a course has no name or par to render, and
 *   hidden courses must never surface publicly (docs/plans/golf-beta-prep.md §1.4).
 * - **Eligible plays only** - passed, unmodded rate, no autoplay (outside the allow-list), not from
 *   the affected DeadSync range. Enforced at write time by leaving ineligible plays out of the
 *   index entirely, and re-checked here so rows written before that rule still behave.
 *
 * Every filter runs before a player is marked as seen, so narrowing by course (or chart) returns each
 * player's most recent play *on that course* (or chart) rather than dropping players whose latest play
 * was elsewhere.
 *
 * Filtering happens after the index read rather than through a per-course partition, so a narrow
 * filter walks more of the feed to fill a page. At MAX_ACTIVITY_PAGES x ACTIVITY_PAGE_SIZE that
 * covers the 500 most recent plays, comfortably the whole table today. If the event grows past
 * that, a selective filter could come back short and course activity would want its own GSI
 * partition - cheap to add, but it needs a backfill, so it is not worth paying for yet.
 *
 * NOT yet filtered: banned and shadowbanned players. Golf's store has no user table and this path
 * has no core lookup, so a banned player would appear here - the most exposed surface for it, being
 * public and logged-out. Tracked as open question 2 in the beta plan.
 */
async function getActivity(params: Record<string, string>) {
  const requested = parseInt(params.limit || '', 10);
  const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_ACTIVITY_LIMIT, MAX_ACTIVITY_LIMIT);

  const courseFilter = params.course?.trim();
  if (courseFilter && !isVisibleCourseSlug(courseFilter)) {
    return respond(400, { error: `Unknown course "${courseFilter}"`, validCourses: VISIBLE_COURSES.map((c) => c.slug) });
  }

  const chartFilter = params.chartHash?.trim();
  if (chartFilter && !resolveVisibleHole(chartFilter)) {
    return respond(400, { error: `Unknown chartHash "${chartFilter}"` });
  }

  const userIds = parseIdFilter(params.userIds);
  if (userIds && userIds.size > MAX_USER_IDS) {
    return respond(400, { error: `Too many userIds (${userIds.size}); the maximum is ${MAX_USER_IDS}` });
  }
  // An explicitly empty list means "restrict to nobody", which is not the same as omitting the
  // parameter - returning the unfiltered feed there would show a rivals-only panel to a user with
  // no rivals as though it were everyone's activity.
  if (userIds && userIds.size === 0) return respond(200, { data: [] });

  const rows: { play: PlayItem; resolved: NonNullable<ReturnType<typeof resolveVisibleHole>> }[] = [];
  const seenUsers = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < MAX_ACTIVITY_PAGES && rows.length < limit; page++) {
    const result = await queryGsiPaginated<PlayItem>('gsi2', 'gsi2pk', ACTIVITY_GSI2PK, {
      scanForward: false,
      limit: ACTIVITY_PAGE_SIZE,
      cursor,
    });

    for (const play of result.items) {
      if (rows.length >= limit) break;
      // Newest first, so the first qualifying row for a player is their most recent. Note this is
      // only an early-out: a player is added to seenUsers below, after passing every filter, so a
      // row rejected here never suppresses that player's next, qualifying one.
      if (seenUsers.has(play.userId)) continue;
      if (userIds && !userIds.has(play.userId)) continue;
      if (play.eligible === false) continue;
      if (chartFilter && play.chartHash !== chartFilter) continue;
      const resolved = resolveVisibleHole(play.chartHash);
      if (!resolved) continue;
      if (courseFilter && resolved.course.slug !== courseFilter) continue;

      seenUsers.add(play.userId);
      rows.push({ play, resolved });
    }

    cursor = result.cursor;
    if (!cursor) break;
  }

  // One BatchGet for every row's dispersion data, rather than one read per row. Plays ingested
  // before PLAY_NOTES items existed simply have none, so noteStrokes can be null and the client
  // must render the row without a plot rather than hiding it.
  const notes = await getNoteStrokes(rows.map(({ play }) => play));

  return respond(200, {
    data: rows.map(({ play, resolved: { course, hole } }) => ({
      playId: play.playId,
      userId: play.userId,
      playerAlias: play.playerAlias ?? null,
      profileImageUrl: play.profileImageUrl ?? null,
      timestamp: play.timestamp,
      courseSlug: course.slug,
      courseName: course.name,
      holeNumber: hole.holeNumber,
      chartHash: play.chartHash,
      songName: hole.displayName,
      artist: hole.artist,
      par: hole.par,
      // Raw integer strokes, as stored everywhere. The displayed "3.45 strokes" is this divided by
      // 1000 to 2dp - the client formats it, matching GolfScoring.lua's in-game HUD.
      totalStrokes: play.totalStrokes,
      noteCount: play.noteCount,
      // Per-note strokes 0..200 for the dispersion plot. The green's shape is seeded from chartHash,
      // so the client derives it (events/golf/frontend/src/components/DispersionChart.tsx).
      noteStrokes: notes.get(play.playId) ?? null,
    })),
  });
}

/** More rival ids than any real rival list; keeps the URL and the work bounded. */
const MAX_RIVAL_IDS = 50;
/** The most strokes a play can plausibly carry (a miss on every note of a 10k-note chart is 2,000,000). */
const MAX_STROKES = 9_999_999;

function parseCsv(value: string | undefined): string[] {
  return value
    ? [
        ...new Set(
          value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ]
    : [];
}

/**
 * GET /rankings?userId&alias&chartHash&playId&strokes&playedAt[&rivalIds=a,b,c]
 *
 * Everything the golf result images need beyond the play itself, in ONE call: the player's previous
 * best on the hole, the hole board, and the course board - each ranked as if this play were already
 * stored. Called from chart.ts's synchronous result-image hook (api/src/utils/event-result-images.ts),
 * which runs inside the submission response and has a hard timeout, so three images' worth of context
 * must be one request, not three.
 *
 * "As if stored" is the point of the strokes/playedAt/playId parameters. Golf's score processor is
 * asynchronous (SNS -> SQS -> Lambda), so when this is called the play is normally not in the table
 * yet - and occasionally already is. The answer is the same either way (see computeRankings).
 *
 * Nothing is written, and nothing here is private: every row is a player already visible on the
 * public boards, so trusting the caller's userId/strokes only lets them ask a hypothetical.
 *
 * Hidden courses and charts on no current course return only `previousBestStrokes`, with `hole` and
 * `course` null - the same visibility rule /activity applies, so a hidden course's board can't be read
 * by naming one of its charts.
 *
 * If either board partition is too large to rank from one read, both are returned null rather than a
 * wrong rank; the image falls back to the result card alone. That is a degraded image, not an error.
 */
async function getRankings(params: Record<string, string>) {
  const { userId, alias, chartHash } = params;
  const playId = parseInt(params.playId || '', 10);
  const strokes = parseInt(params.strokes || '', 10);
  const playedAtMs = Date.parse(params.playedAt || '');

  if (!userId || !alias || !chartHash) return respond(400, { error: 'userId, alias and chartHash are required' });
  if (!Number.isInteger(playId) || playId <= 0) return respond(400, { error: 'playId must be a positive integer' });
  if (!Number.isInteger(strokes) || strokes < 0 || strokes > MAX_STROKES) return respond(400, { error: `strokes must be an integer from 0 to ${MAX_STROKES}` });
  if (Number.isNaN(playedAtMs)) return respond(400, { error: 'playedAt must be an ISO timestamp' });
  const rivalIds = parseCsv(params.rivalIds);
  if (rivalIds.length > MAX_RIVAL_IDS) return respond(400, { error: `Too many rivalIds (${rivalIds.length}); the maximum is ${MAX_RIVAL_IDS}` });

  const resolved = resolveVisibleHole(chartHash);
  // The viewer's stored bests. Strongly consistent: the player may have just set one.
  const selfBestItems = await queryState<BestItem>(`USER#${userId}`, 'BEST#', { consistent: true });
  const storedBest = selfBestItems.find((b) => b.chartHash === chartHash);
  const previousBestStrokes = storedBest && storedBest.playId !== playId ? storedBest.totalStrokes : null;

  if (!resolved) {
    return respond(200, { previousBestStrokes, hole: null, course: null });
  }
  const { course, hole } = resolved;

  const [holePartition, coursePartition] = await Promise.all([
    queryGsiAll<BestItem>('gsi1', 'gsi1pk', holePartitionKey(chartHash)),
    queryGsiAll<CourseStandingItem>('gsi2', 'gsi2pk', coursePartitionKey(course.slug)),
  ]);
  if (holePartition.truncated || coursePartition.truncated) {
    console.warn(`[golf] board for ${chartHash} / ${course.slug} exceeds the one-read ceiling - returning no rankings`);
    return respond(200, { previousBestStrokes, hole: null, course: null });
  }

  const ranked = computeRankings({
    userId,
    alias,
    chartHash,
    playId,
    strokes,
    playedAt: new Date(playedAtMs).toISOString(),
    rivalIds: new Set(rivalIds),
    course: { chartHashes: new Set(course.holes.map((h) => h.chartHash)), totalHoles: course.holes.length },
    holeRows: holePartition.items.map((i) => ({
      userId: i.userId,
      alias: i.playerAlias ?? 'Unknown',
      totalStrokes: i.totalStrokes,
      achievedAt: i.timestamp ?? i.updatedAt,
    })),
    courseRows: coursePartition.items.map((i) => ({
      userId: i.userId,
      alias: i.playerAlias,
      holesCompleted: i.holesCompleted,
      totalStrokes: i.totalStrokes,
      achievedAt: i.achievedAt,
    })),
    selfBests: selfBestItems.map((b) => ({
      chartHash: b.chartHash,
      totalStrokes: b.totalStrokes,
      achievedAt: b.timestamp ?? b.updatedAt,
      playId: b.playId,
    })),
  });

  return respond(200, {
    // computeRankings reports null when this very play is already the stored best; honour that over
    // the simple lookup above, which would otherwise return the play's own score.
    previousBestStrokes: ranked.previousBestStrokes,
    hole: {
      courseSlug: course.slug,
      courseName: course.name,
      holeNumber: hole.holeNumber,
      songName: hole.displayName,
      artist: hole.artist,
      par: hole.par,
      ...ranked.hole,
    },
    course: {
      slug: course.slug,
      name: course.name,
      ...ranked.course,
    },
  });
}

/**
 * GET /courses - every public course with its holes (chart hash, song, artist, par). Static: it comes from
 * the bundled course config, not the table, so it costs no reads and can't be slow.
 */
function getCourses() {
  return respond(200, buildCoursesIndex(COURSES));
}

/**
 * GET /courses/{slug}: one course, same fields as a /courses entry. A hidden course is a 404, the same as an
 * unknown one.
 *
 * For a logged-in caller (a valid session JWT in `Authorization: Bearer`, see auth.ts) the response also
 * carries `bests`: that player's best on each hole of the course they have played, from one query on their
 * partition - so a course page needs one request, not one per hole. Anonymous callers, and callers with a
 * bad or expired token, get the plain course with no `bests` key.
 */
async function getCourse(slug: string, headers: Record<string, string> | undefined) {
  const detail = buildCourseDetail(COURSES, slug);
  if (!detail) return respond(404, { error: 'Unknown course' });

  const viewer = await getViewer(headers);
  if (!viewer) return respond(200, detail);

  const course = findVisibleCourse(COURSES, slug)!;
  const items = await queryState<BestItem>(`USER#${viewer.userId}`, 'BEST#');
  const bests = buildPlayerBests(
    course,
    items.map((b) => ({ chartHash: b.chartHash, totalStrokes: b.totalStrokes, achievedAt: b.timestamp ?? b.updatedAt })),
  );
  return respond(200, { ...detail, bests });
}

/**
 * Both boards below read their whole partition and page in memory, rather than paging the index. At this
 * scale a partition is a few hundred bytes per player, so a request costs one cheap query and gets the true
 * total and absolute ranks for free. The read is capped (queryGsiAll's maxPages); a board past the cap is a
 * 503, not a wrong ranking from a truncated read.
 *
 * These are public, unauthenticated reads of what is already public elsewhere. Known gaps a consumer should
 * not paper over - see events/golf/backend/README.md: banned and shadowbanned players are not filtered,
 * plays deleted in core are not removed, and a player's alias is as of their last best.
 */
function boardTooLarge(what: string) {
  console.error(`[golf] ${what} exceeds the one-read ceiling - refusing to serve a truncated ranking`);
  return respond(503, { error: 'Leaderboard too large to serve' });
}

/**
 * GET /courses/{slug}/leaderboard?limit&offset - everyone's standing on one course: finished rounds first by
 * total strokes, then unfinished rounds by holes completed. 404 for an unknown or hidden slug, which are
 * deliberately indistinguishable.
 */
async function getCourseLeaderboard(slug: string, params: Record<string, string>) {
  const course = findVisibleCourse(COURSES, slug);
  if (!course) return respond(404, { error: 'Unknown course' });

  const { items, truncated } = await queryGsiAll<CourseStandingItem>('gsi2', 'gsi2pk', coursePartitionKey(course.slug));
  if (truncated) return boardTooLarge(`course board ${course.slug}`);

  return respond(
    200,
    buildCourseLeaderboard({
      course,
      rows: items.map((i) => ({
        userId: i.userId,
        alias: i.playerAlias,
        profileImageUrl: i.profileImageUrl,
        holesCompleted: i.holesCompleted,
        totalStrokes: i.totalStrokes,
        achievedAt: i.achievedAt,
      })),
      ...parsePaging(params),
    }),
  );
}

/**
 * GET /holes/{chartHash}/leaderboard?limit&offset - each player's best on one hole, fewest strokes first. 404
 * for a chart on no current course or on a hidden one.
 */
async function getHoleLeaderboard(chartHash: string, params: Record<string, string>) {
  const resolved = resolveVisibleHole(chartHash);
  if (!resolved) return respond(404, { error: 'Unknown hole' });

  const { items, truncated } = await queryGsiAll<BestItem>('gsi1', 'gsi1pk', holePartitionKey(chartHash));
  if (truncated) return boardTooLarge(`hole board ${chartHash}`);

  return respond(
    200,
    buildHoleLeaderboard({
      course: resolved.course,
      hole: resolved.hole,
      rows: items.map((i) => ({
        userId: i.userId,
        alias: i.playerAlias ?? 'Unknown',
        profileImageUrl: i.profileImageUrl,
        totalStrokes: i.totalStrokes,
        achievedAt: i.timestamp ?? i.updatedAt,
      })),
      ...parsePaging(params),
    }),
  );
}

export async function handler(event: FunctionUrlEvent) {
  const path = event.rawPath || '/';
  const params = event.queryStringParameters || {};

  if (path === '/best') return getBest(params);
  if (path === '/activity') return getActivity(params);
  if (path === '/rankings') return getRankings(params);
  if (path === '/courses') return getCourses();

  const courseDetail = path.match(/^\/courses\/([^/]+)$/);
  if (courseDetail) return getCourse(courseDetail[1], event.headers);

  const courseBoard = path.match(/^\/courses\/([^/]+)\/leaderboard$/);
  if (courseBoard) return getCourseLeaderboard(courseBoard[1], params);

  const holeBoard = path.match(/^\/holes\/([^/]+)\/leaderboard$/);
  if (holeBoard) return getHoleLeaderboard(holeBoard[1], params);

  return respond(404, { error: 'Not found' });
}
