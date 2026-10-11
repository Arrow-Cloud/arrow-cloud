import coursesConfig from '../../config/courses.json';

/**
 * Course/hole resolution for golf's backend.
 *
 * Everything a chart "is" - which course it belongs to, its hole number, its par, its display name -
 * is resolved from events/golf/config/courses.json at *read* time, never captured onto the item at
 * score time. That's deliberate: par and hole order are curation data that change (the beta packs
 * have already gone vE2 -> vF3 -> vF4, revising 13 pars along the way), and baking them into every
 * written item would mean a backfill of all historical plays on every revision. Only facts about
 * the play itself - strokes, when, who - live on the item.
 *
 * The flip side: a chart dropped from a course (as 5 charts were in vF3) stops resolving here, and
 * plays already recorded against it become unresolvable. That's why lookups return undefined rather
 * than throwing, and why every public read path filters those rows out instead of rendering a hole
 * with no name or par. There are 15 such orphaned plays in the table today.
 */

export interface Hole {
  holeNumber: number;
  chartHash: string;
  displayName: string;
  songName: string;
  songFolder: string;
  artist: string;
  meter: number;
  par: number | null;
}

export interface Course {
  /** Stable public identifier, used in API query params and responses. */
  slug: string;
  name: string;
  order: number;
  /** Hidden courses never appear in a public listing, board, or feed - see
   * docs/plans/golf-beta-prep.md §1.4. */
  hidden: boolean;
  pack: string | null;
  holes: Hole[];
}

export const COURSES: Course[] = (coursesConfig as { courses: Course[] }).courses;

export interface ResolvedHole {
  course: Course;
  hole: Hole;
}

const BY_HASH = new Map<string, ResolvedHole>();
for (const course of COURSES) {
  for (const hole of course.holes) {
    BY_HASH.set(hole.chartHash, { course, hole });
  }
}

/** Resolve a chart hash to its course and hole, or undefined if it belongs to no current course. */
export function resolveHole(chartHash: string): ResolvedHole | undefined {
  return BY_HASH.get(chartHash);
}

/** Resolve a chart hash only if it's on a publicly visible course - the check every public read
 * path needs, since it rejects both orphaned charts and hidden-course charts in one call. */
export function resolveVisibleHole(chartHash: string): ResolvedHole | undefined {
  const resolved = BY_HASH.get(chartHash);
  return resolved && !resolved.course.hidden ? resolved : undefined;
}

/** Courses a public caller may name, in display order. Hidden courses are deliberately absent, so
 * `?course=alpha-testing` is rejected as unknown rather than silently returning nothing - a caller
 * that mistypes a slug should hear about it, and one that guesses the hidden course learns nothing. */
export const VISIBLE_COURSES: Course[] = COURSES.filter((c) => !c.hidden).sort((a, b) => a.order - b.order);

const VISIBLE_SLUGS = new Set(VISIBLE_COURSES.map((c) => c.slug));

export function isVisibleCourseSlug(slug: string): boolean {
  return VISIBLE_SLUGS.has(slug);
}
