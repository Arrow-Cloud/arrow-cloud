import { getState, queryGsiPaginated, getNoteStrokes, ACTIVITY_GSI2PK, type BestItem, type PlayItem } from './shared';
import { resolveVisibleHole, isVisibleCourseSlug, VISIBLE_COURSES } from './courses';

interface FunctionUrlEvent {
  requestContext: { http: { method: string; path: string } };
  queryStringParameters?: Record<string, string>;
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
 * GET /activity?limit=N&course=<slug>&userIds=<id,id,...>
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
 * Every filter runs before a player is marked as seen, so narrowing by course returns each player's
 * most recent play *on that course* rather than dropping players whose latest play was elsewhere.
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

  const userIds = params.userIds
    ? new Set(
        params.userIds
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      )
    : undefined;
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

export async function handler(event: FunctionUrlEvent) {
  const path = event.rawPath || '/';
  const params = event.queryStringParameters || {};

  if (path === '/best') return getBest(params);
  if (path === '/activity') return getActivity(params);

  return respond(404, { error: 'Not found' });
}
