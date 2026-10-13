/**
 * Golf ranking rules, as a pure zero-dependency module.
 *
 * The score processor writes ranked items, the read API orders and ranks them, and
 * scripts/backfill-golf-play-notes.ts rewrites them, and all three have to agree on the key encoding to
 * the character. A DynamoDB sort key baked into written items is the most expensive thing in this feature
 * to get wrong - changing it later means rewriting every item - so there is exactly one definition of it,
 * and it is tested.
 *
 * This lives with the golf backend because only the golf backend runs it. The core API never ranks
 * anything: it asks golf's /rankings route over HTTP and renders what comes back (see
 * api/src/utils/event-result-images.ts, which declares the response shape it consumes rather than
 * importing it from here). Contrast scoring/golf.ts and scoring/eligibility.ts, which stay in api/
 * because core evaluates them too.
 *
 * Pure on purpose - no PrismaClient, no AWS SDK - so the backfill script, which runs outside Lambda and
 * imports this by relative path, can use it without dragging in a Lambda's dependencies.
 *
 * Ordering rules implemented here (docs/plans/golf-beta-prep.md, "Decisions" 2 and 3, on the
 * golf-beta-prep branch):
 *
 * - **Hole boards** rank each player's single best (fewest strokes) eligible play on that hole.
 * - **Course boards** list completed rounds first, ascending by total strokes, then partial rounds by
 *   holes completed (descending), tie-broken by total strokes (ascending). Totals over different hole
 *   counts are not comparable - a player who has played fewer holes always has fewer strokes - so
 *   holes-completed, not strokes, is the primary key for partial rounds.
 * - Boards are per course. There is no combined cross-course standing.
 *
 * Where the plan is silent - two players on exactly the same standing - the tie goes to whoever reached
 * it first, matching pack leaderboards (whose sort key puts earlier timestamps ahead). That is a choice
 * made here, not a decision taken from the plan, and is called out as such wherever it surfaces.
 */

// --- Sort keys ---

/** Raw strokes on one hole. Width 7 covers 9,999,999; the worst realistic hole is a miss on every note
 * of a 10k-note chart, which is 2,000,000. */
const HOLE_STROKES_WIDTH = 7;
/** Raw strokes across a course. Width 9 covers 999,999,999 - well past 18 holes at the ceiling above. */
const COURSE_STROKES_WIDTH = 9;
/** Holes still to play. Two digits allows a 99-hole course. */
const COURSE_HOLES_WIDTH = 2;

function pad(n: number, width: number): string {
  return String(Math.max(0, Math.round(n))).padStart(width, '0');
}

/** gsi1 partition holding every player's best on one hole. */
export function holePartitionKey(chartHash: string): string {
  return `HOLE#${chartHash}`;
}

/** gsi2 partition holding every player's standing on one course. Shares an index with the
 * activity feed's 'ACTIVITY' partition; partitions are values, so they don't interact. */
export function coursePartitionKey(courseSlug: string): string {
  return `COURSE#${courseSlug}`;
}

export interface HoleBest {
  userId: string;
  alias: string;
  /** Raw integer strokes, as stored everywhere. Display is this / 1000. */
  totalStrokes: number;
  /** ISO timestamp of the play that set this best. */
  achievedAt: string;
}

/** Ascending order of this key IS the ranking: fewest strokes first, then whoever got there first,
 * then userId so the order is deterministic for identical rows. Zero padding makes string order
 * agree with numeric order. */
export function holeSortKey(best: Pick<HoleBest, 'totalStrokes' | 'achievedAt' | 'userId'>): string {
  return `${pad(best.totalStrokes, HOLE_STROKES_WIDTH)}#${best.achievedAt}#${best.userId}`;
}

export interface CourseStanding {
  userId: string;
  alias: string;
  holesCompleted: number;
  /** Sum of the player's best on each completed hole, raw integer strokes. */
  totalStrokes: number;
  /** When the player reached this standing: the latest of the bests that make it up. */
  achievedAt: string;
}

/**
 * Ascending order of this key IS the course ranking. Composite on purpose, so the whole ordering
 * rule lives in one place and a read is a single ranged query:
 *
 *   [0 if complete, 1 if partial] # [holes still to play] # [total strokes] # [reached at] # [userId]
 *
 * Completed rounds all start `0#00#`, so they sort among themselves by strokes. Partial rounds start
 * `1#`, so they always sort after every completed round, then by fewest holes remaining (= most holes
 * completed), then by strokes. `totalHoles` is the course's hole count when the key is written - if a
 * course's hole count changes, standings need re-deriving (the backfill does this).
 */
export function courseSortKey(standing: CourseStanding, totalHoles: number): string {
  const complete = standing.holesCompleted >= totalHoles;
  const remaining = Math.max(0, totalHoles - standing.holesCompleted);
  return [
    complete ? '0' : '1',
    pad(remaining, COURSE_HOLES_WIDTH),
    pad(standing.totalStrokes, COURSE_STROKES_WIDTH),
    standing.achievedAt,
    standing.userId,
  ].join('#');
}

// --- Course aggregation ---

export interface ChartBest {
  chartHash: string;
  totalStrokes: number;
  achievedAt: string;
  /** The play that set this best, when known. Lets a caller tell "my stored best is an older play"
   * from "my stored best is the play I am ranking right now" - see computeRankings. */
  playId?: number;
}

/**
 * A player's standing on one course, derived from their per-hole bests. Charts outside the course are
 * ignored, and if a hole somehow appears twice the fewer-strokes one counts.
 *
 * Returns undefined when none of the player's bests are on this course - there is no standing to rank.
 */
export function aggregateCourse(
  bests: readonly ChartBest[],
  courseChartHashes: ReadonlySet<string>,
): Pick<CourseStanding, 'holesCompleted' | 'totalStrokes' | 'achievedAt'> | undefined {
  const bestByHole = new Map<string, ChartBest>();
  for (const best of bests) {
    if (!courseChartHashes.has(best.chartHash)) continue;
    const current = bestByHole.get(best.chartHash);
    if (!current || best.totalStrokes < current.totalStrokes) bestByHole.set(best.chartHash, best);
  }
  if (bestByHole.size === 0) return undefined;

  let totalStrokes = 0;
  let achievedAt = '';
  for (const best of bestByHole.values()) {
    totalStrokes += best.totalStrokes;
    if (best.achievedAt > achievedAt) achievedAt = best.achievedAt;
  }
  return { holesCompleted: bestByHole.size, totalStrokes, achievedAt };
}

// --- Applying a play that may not be in the store yet ---

/**
 * Golf's score processor runs asynchronously (SNS -> SQS -> Lambda), so when a result image is
 * rendered during the submission request, the play that triggered it is usually not in the store yet -
 * and occasionally already is, if the processor won the race. Rankings therefore have to be computed
 * *as if* the play were included, and must give the same answer either way.
 *
 * Given the player's stored best on a hole (if any) and this play, returns the best that should be
 * ranked and whether the play improved on what was stored. A tie keeps the stored best, because on an
 * exact tie the earlier achiever ranks ahead.
 *
 * This compares scores only. It cannot tell that a stored best *is* the play being ranked - when the
 * processor has already stored it, the two look like an exact tie and nothing is reported as improved.
 * computeRankings handles that case by play id before calling this.
 */
export function applyPlayToHoleBest(existing: HoleBest | undefined, candidate: HoleBest): { best: HoleBest; improved: boolean } {
  if (!existing) return { best: candidate, improved: true };
  const candidateWins = candidate.totalStrokes < existing.totalStrokes;
  return candidateWins ? { best: candidate, improved: true } : { best: existing, improved: false };
}

// --- Ranking ---

export interface Ranked<T> {
  rank: number;
  isSelf: boolean;
  isRival: boolean;
  entry: T;
}

function rankRows<T extends { userId: string }>(rows: T[], keyOf: (row: T) => string, selfUserId: string, rivalIds: ReadonlySet<string>): Ranked<T>[] {
  return rows
    .slice()
    .sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
    .map((entry, i) => ({
      rank: i + 1,
      isSelf: entry.userId === selfUserId,
      isRival: rivalIds.has(entry.userId),
      entry,
    }));
}

/** Rank a hole board with the viewer's (already resolved) best swapped in for whatever is stored. */
export function rankHole(stored: readonly HoleBest[], self: HoleBest, rivalIds: ReadonlySet<string>): Ranked<HoleBest>[] {
  const others = stored.filter((row) => row.userId !== self.userId);
  return rankRows<HoleBest>([...others, self], holeSortKey, self.userId, rivalIds);
}

/** Rank a course board with the viewer's (already resolved) standing swapped in for whatever is stored. */
export function rankCourse(
  stored: readonly CourseStanding[],
  self: CourseStanding,
  totalHoles: number,
  rivalIds: ReadonlySet<string>,
): Ranked<CourseStanding>[] {
  const others = stored.filter((row) => row.userId !== self.userId);
  return rankRows<CourseStanding>([...others, self], (row) => courseSortKey(row, totalHoles), self.userId, rivalIds);
}

// --- Whole boards, with no viewer ---

/**
 * A hole's full leaderboard: every player's best, ranked. The same ordering as rankHole with nobody swapped in.
 *
 * The order is recomputed from the rows (holeSortKey) rather than taken from the order the index returned
 * them in, so a board is correct from its data alone and does not depend on the stored sort keys being current.
 */
export function rankHoleBoard(stored: readonly HoleBest[]): Ranked<HoleBest>[] {
  return rankRows<HoleBest>([...stored], holeSortKey, '', new Set());
}

/**
 * A course's full leaderboard, ranked as rankCourse does but with nobody swapped in. `totalHoles` is the
 * course's hole count NOW, and decides both who counts as finished and how rows sort. That is the point of
 * re-deriving the order here: a stored course key bakes in the hole count from when it was written, so if a
 * course gains or loses a hole the stored order goes stale until each standing is rewritten, while this one
 * is right immediately.
 */
export function rankCourseBoard(stored: readonly CourseStanding[], totalHoles: number): Ranked<CourseStanding>[] {
  return rankRows<CourseStanding>([...stored], (row) => courseSortKey(row, totalHoles), '', new Set());
}

// --- Choosing which rows a card shows ---

/** Rows pinned to the top of every page. */
export const LEADERBOARD_TOP_N = 2;
/** A page is filled to this many rows when there are enough players to do so. */
export const LEADERBOARD_TARGET_SIZE = 7;

/**
 * Pick the rows a ranking page shows: the leaders, the viewer, the players either side of the viewer,
 * the best-ranked rival and the rival nearest the viewer, then - if that's still short of
 * LEADERBOARD_TARGET_SIZE - whoever is closest to the viewer. Returned in rank order.
 *
 * This is the same rule pack-leaderboard.ts's selectNearbyRankings applies to pack pages, ported
 * rather than shared because that file pulls in PrismaClient. One deliberate difference: rows are
 * de-duplicated by userId, where the pack version de-duplicates by alias, which would merge two
 * different players who happen to share a display name.
 */
export function selectNearby<T extends { userId: string }>(
  ranked: readonly Ranked<T>[],
  topN: number = LEADERBOARD_TOP_N,
  targetSize: number = LEADERBOARD_TARGET_SIZE,
): Ranked<T>[] {
  const self = ranked.find((r) => r.isSelf);
  const top = ranked.filter((r) => r.rank <= topN);
  const neighbours = self ? ranked.filter((r) => r.rank === self.rank - 1 || r.rank === self.rank + 1) : [];

  const rivalsByRank = ranked.filter((r) => r.isRival).sort((a, b) => a.rank - b.rank);
  const topRival = rivalsByRank[0];
  let nearestRival: Ranked<T> | undefined;
  if (self && rivalsByRank.length) {
    const byDistance = [...rivalsByRank].sort((a, b) => Math.abs(a.rank - self.rank) - Math.abs(b.rank - self.rank));
    // If the closest rival is also the top rival, prefer the next closest - otherwise the same
    // player would be chosen twice and the slot wasted.
    nearestRival = byDistance[0] === topRival && byDistance.length > 1 ? byDistance[1] : byDistance[0];
  }

  const chosen = new Map<string, Ranked<T>>();
  const add = (r?: Ranked<T>) => {
    if (r && !chosen.has(r.entry.userId)) chosen.set(r.entry.userId, r);
  };
  top.forEach(add);
  add(self);
  neighbours.forEach(add);
  add(topRival);
  add(nearestRival);

  if (chosen.size < targetSize && self) {
    const remaining = ranked.filter((r) => !chosen.has(r.entry.userId)).sort((a, b) => Math.abs(a.rank - self.rank) - Math.abs(b.rank - self.rank));
    for (const r of remaining) {
      if (chosen.size >= targetSize) break;
      chosen.set(r.entry.userId, r);
    }
  }

  return Array.from(chosen.values()).sort((a, b) => a.rank - b.rank);
}

// --- Putting it together for one play ---

export interface HoleRankingRow {
  rank: number;
  userId: string;
  alias: string;
  /** Raw integer strokes - this player's best on the hole. */
  totalStrokes: number;
  isSelf: boolean;
  isRival: boolean;
  /** Set only on the viewer's own row, when this play did not beat their best - so the row shows an
   * older score than the play that triggered the image, and the page needs to say so. */
  isPreviousBest: boolean;
}

export interface CourseRankingRow {
  rank: number;
  userId: string;
  alias: string;
  /** Raw integer strokes across the holes this player has completed. */
  totalStrokes: number;
  holesCompleted: number;
  isSelf: boolean;
  isRival: boolean;
  /** As HoleRankingRow.isPreviousBest, for the course standing. */
  isPreviousBest: boolean;
}

export interface RankingsInput {
  userId: string;
  alias: string;
  chartHash: string;
  /** The play being ranked. Used to recognise it if the processor has already stored it. */
  playId: number;
  /** This play's raw strokes, computed by core with calculateGolfStrokes. */
  strokes: number;
  /** When this play was made - the achievedAt it would carry if it becomes the viewer's best. */
  playedAt: string;
  rivalIds: ReadonlySet<string>;
  course: { chartHashes: ReadonlySet<string>; totalHoles: number };
  /** Every stored best on this hole, any order. */
  holeRows: readonly HoleBest[];
  /** Every stored standing on this course, any order. */
  courseRows: readonly CourseStanding[];
  /** The viewer's stored bests across all charts. Read directly (not via courseRows) because their
   * standing is recomputed from these, so a stale or missing course item cannot skew it. */
  selfBests: readonly ChartBest[];
}

export interface RankingsResult {
  /** The viewer's best on this hole before this play, or null. Lets one call replace the separate
   * /best lookup the result card's delta line used. Also null when the processor has already stored
   * this play as the best: the score it replaced is gone, and null (no delta line) is honest where
   * the stored value would show a misleading 0.00 against itself. */
  previousBestStrokes: number | null;
  hole: { totalPlayers: number; selfRank: number; rows: HoleRankingRow[] };
  course: { totalPlayers: number; selfRank: number; holesTotal: number; selfHolesCompleted: number; selfComplete: boolean; rows: CourseRankingRow[] };
}

/**
 * The hole page and the course page for one play, ranked as if the play were already stored.
 *
 * The course standing is derived from the viewer's per-hole bests with this hole's best swapped in,
 * not by adjusting a stored course total - the stored total can lag the bests it summarises, and the
 * bests are the source of truth.
 */
export function computeRankings(input: RankingsInput): RankingsResult {
  const existingHole = input.selfBests.find((b) => b.chartHash === input.chartHash);
  // The processor can win the race and store this play before we rank it. If the stored best IS this
  // play, treat it as not stored yet: it is the play that improved things, so the row must not be
  // flagged as an older score, and there is no earlier score left to report as the previous best.
  const storedIsThisPlay = existingHole?.playId !== undefined && existingHole.playId === input.playId;
  const storedSelf: HoleBest | undefined =
    existingHole && !storedIsThisPlay
      ? { userId: input.userId, alias: input.alias, totalStrokes: existingHole.totalStrokes, achievedAt: existingHole.achievedAt }
      : undefined;
  const candidate: HoleBest = { userId: input.userId, alias: input.alias, totalStrokes: input.strokes, achievedAt: input.playedAt };
  const { best, improved } = applyPlayToHoleBest(storedSelf, candidate);

  // --- hole ---
  const holeRanked = rankHole(input.holeRows, best, input.rivalIds);
  const holeSelfRank = holeRanked.find((r) => r.isSelf)!.rank;
  const holeRows: HoleRankingRow[] = selectNearby(holeRanked).map((r) => ({
    rank: r.rank,
    userId: r.entry.userId,
    alias: r.entry.alias,
    totalStrokes: r.entry.totalStrokes,
    isSelf: r.isSelf,
    isRival: r.isRival,
    isPreviousBest: r.isSelf && !improved,
  }));

  // --- course ---
  const bestsAfter: ChartBest[] = [
    ...input.selfBests.filter((b) => b.chartHash !== input.chartHash),
    { chartHash: input.chartHash, totalStrokes: best.totalStrokes, achievedAt: best.achievedAt },
  ];
  // Non-null: bestsAfter always contains this chart, and the caller only asks about charts on the course.
  const after = aggregateCourse(bestsAfter, input.course.chartHashes)!;
  const selfStanding: CourseStanding = { userId: input.userId, alias: input.alias, ...after };
  // A standing changes exactly when one of its hole bests does: a new best on a hole either adds a
  // hole or lowers a total, and no new best leaves the sum untouched. So the course row is an older
  // score precisely when the hole row is.
  const courseImproved = improved;

  const courseRanked = rankCourse(input.courseRows, selfStanding, input.course.totalHoles, input.rivalIds);
  const courseSelfRank = courseRanked.find((r) => r.isSelf)!.rank;
  const courseRows: CourseRankingRow[] = selectNearby(courseRanked).map((r) => ({
    rank: r.rank,
    userId: r.entry.userId,
    alias: r.entry.alias,
    totalStrokes: r.entry.totalStrokes,
    holesCompleted: r.entry.holesCompleted,
    isSelf: r.isSelf,
    isRival: r.isRival,
    isPreviousBest: r.isSelf && !courseImproved,
  }));

  return {
    previousBestStrokes: existingHole && !storedIsThisPlay ? existingHole.totalStrokes : null,
    hole: { totalPlayers: holeRanked.length, selfRank: holeSelfRank, rows: holeRows },
    course: {
      totalPlayers: courseRanked.length,
      selfRank: courseSelfRank,
      holesTotal: input.course.totalHoles,
      selfHolesCompleted: after.holesCompleted,
      selfComplete: after.holesCompleted >= input.course.totalHoles,
      rows: courseRows,
    },
  };
}
