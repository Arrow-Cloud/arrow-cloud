import { rankCourseBoard, rankHoleBoard, type CourseStanding, type HoleBest } from './rankings';

/**
 * Response builders for the public leaderboard routes (GET /courses, /courses/{slug}/leaderboard,
 * /holes/{hash}/leaderboard in read-api.ts).
 *
 * Pure: they take the course configuration and the rows already read from the table as arguments. That keeps
 * the I/O in read-api.ts and lets these be tested without DynamoDB or the course JSON (courses.ts imports it,
 * which the api's jest setup can't). The course and hole shapes below are structural - courses.ts's own types
 * satisfy them - so there is nothing to keep in sync by hand.
 */

export interface HoleConfig {
  holeNumber: number;
  chartHash: string;
  displayName: string;
  artist: string;
  meter: number;
  par: number | null;
  bannerUrl: string | null;
}

export interface CourseConfig {
  slug: string;
  name: string;
  order: number;
  hidden: boolean;
  description: string | null;
  bannerUrl: string | null;
  holes: readonly HoleConfig[];
}

// --- Paging ---

export const DEFAULT_LEADERBOARD_LIMIT = 50;
export const MAX_LEADERBOARD_LIMIT = 100;

/**
 * `limit` and `offset` from the query string. Anything unusable falls back to a default rather than being an
 * error - a leaderboard page that 400s because someone typed `?limit=abc` is worse than one that shows the
 * first page - and `limit` is capped so one request can't ask for a whole large board in a single response.
 */
export function parsePaging(params: Record<string, string | undefined>): { limit: number; offset: number } {
  const limit = parseInt(params.limit ?? '', 10);
  const offset = parseInt(params.offset ?? '', 10);
  return {
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(limit, MAX_LEADERBOARD_LIMIT) : DEFAULT_LEADERBOARD_LIMIT,
    offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
  };
}

// --- Courses ---

/** Courses a public caller may see, in display order. A hidden course is excluded here, so it cannot leak
 * through the index or be looked up by slug - see findVisibleCourse. */
export function visibleCourses<T extends CourseConfig>(courses: readonly T[]): T[] {
  return courses.filter((c) => !c.hidden).sort((a, b) => a.order - b.order);
}

/** A course by slug, or undefined for an unknown one *or a hidden one* - the two are deliberately
 * indistinguishable, so naming a hidden course reveals nothing. */
export function findVisibleCourse<T extends CourseConfig>(courses: readonly T[], slug: string): T | undefined {
  return visibleCourses(courses).find((c) => c.slug === slug);
}

/** Sum of a course's par, or null if any hole has none - a partial total would read as the real one. */
function parTotal(course: CourseConfig): number | null {
  let total = 0;
  for (const hole of course.holes) {
    if (hole.par === null) return null;
    total += hole.par;
  }
  return total;
}

/** The course as a public caller sees it, holes included. The one shape behind both GET /courses (a list of
 * these) and GET /courses/{slug}, so the two cannot drift apart. */
function publicCourse(course: CourseConfig) {
  return {
    slug: course.slug,
    name: course.name,
    order: course.order,
    description: course.description,
    bannerUrl: course.bannerUrl,
    holesTotal: course.holes.length,
    parTotal: parTotal(course),
    holes: course.holes.map((hole) => ({
      holeNumber: hole.holeNumber,
      chartHash: hole.chartHash,
      songName: hole.displayName,
      artist: hole.artist,
      meter: hole.meter,
      par: hole.par,
      bannerUrl: hole.bannerUrl,
    })),
  };
}

/** GET /courses: every visible course with its holes. Static - nothing here comes from the table. */
export function buildCoursesIndex(courses: readonly CourseConfig[]) {
  return { courses: visibleCourses(courses).map(publicCourse) };
}

/** GET /courses/{slug}: one visible course, or undefined for an unknown or hidden one (see findVisibleCourse). */
export function buildCourseDetail(courses: readonly CourseConfig[], slug: string) {
  const course = findVisibleCourse(courses, slug);
  return course ? { course: publicCourse(course) } : undefined;
}

/** One player's stored best on one hole, as GET /courses/{slug}?userId returns it. */
export interface PlayerHoleBest {
  chartHash: string;
  totalStrokes: number;
  achievedAt: string;
}

/**
 * The viewer's bests on this course's holes, in hole order. `bests` is every best the player has stored
 * (any course); only this course's holes are kept, and a hole they haven't played is simply absent.
 */
export function buildPlayerBests(course: CourseConfig, bests: readonly PlayerHoleBest[]): PlayerHoleBest[] {
  const byHash = new Map(bests.map((b) => [b.chartHash, b]));
  return course.holes.flatMap((hole) => {
    const best = byHash.get(hole.chartHash);
    return best ? [{ chartHash: best.chartHash, totalStrokes: best.totalStrokes, achievedAt: best.achievedAt }] : [];
  });
}

// --- Boards ---

/** The window of an already-ranked board that was asked for. Ranks stay absolute: page two starts at 51. */
function page<T>(ranked: readonly T[], limit: number, offset: number): T[] {
  return ranked.slice(offset, offset + limit);
}

/**
 * GET /courses/{slug}/leaderboard. Finished rounds first by total strokes, then unfinished rounds by holes
 * completed (most first) and strokes - the order is rankings.ts's rankCourseBoard, derived against the
 * course's hole count now, not read back from the stored index keys.
 */
export function buildCourseLeaderboard(args: { course: CourseConfig; rows: readonly CourseStanding[]; limit: number; offset: number }) {
  const { course, rows, limit, offset } = args;
  const holesTotal = course.holes.length;
  const ranked = rankCourseBoard(rows, holesTotal);
  return {
    course: { slug: course.slug, name: course.name, holesTotal },
    totalPlayers: ranked.length,
    limit,
    offset,
    rows: page(ranked, limit, offset).map((r) => ({
      rank: r.rank,
      userId: r.entry.userId,
      alias: r.entry.alias,
      profileImageUrl: r.entry.profileImageUrl ?? null,
      totalStrokes: r.entry.totalStrokes,
      holesCompleted: r.entry.holesCompleted,
      complete: r.entry.holesCompleted >= holesTotal,
    })),
  };
}

/** GET /holes/{hash}/leaderboard: each player's best on the hole, fewest strokes first. */
export function buildHoleLeaderboard(args: { course: CourseConfig; hole: HoleConfig; rows: readonly HoleBest[]; limit: number; offset: number }) {
  const { course, hole, rows, limit, offset } = args;
  const ranked = rankHoleBoard(rows);
  return {
    hole: {
      chartHash: hole.chartHash,
      courseSlug: course.slug,
      courseName: course.name,
      holeNumber: hole.holeNumber,
      songName: hole.displayName,
      artist: hole.artist,
      par: hole.par,
    },
    totalPlayers: ranked.length,
    limit,
    offset,
    rows: page(ranked, limit, offset).map((r) => ({
      rank: r.rank,
      userId: r.entry.userId,
      alias: r.entry.alias,
      profileImageUrl: r.entry.profileImageUrl ?? null,
      totalStrokes: r.entry.totalStrokes,
      achievedAt: r.entry.achievedAt,
    })),
  };
}
