import { putState, queryState, type BestItem } from './shared';
import { resolveHole } from './courses';
import { aggregateCourse, coursePartitionKey, courseSortKey, type CourseStanding } from './rankings';

/**
 * Rebuild one player's standing on the course a chart belongs to, from their per-hole bests, and write
 * it into gsi2 where the course board reads it.
 *
 * Recomputed from the bests every time rather than incremented. An increment would be a
 * read-modify-write on a single item, and golf's score processor runs several Lambdas at once, so two
 * of one player's plays landing together could overwrite each other's total. Recomputing makes the
 * item a pure function of the bests: concurrent writers both read the bests and write the answer, and
 * the worst case is a stale item that the player's next eligible play (or the backfill) corrects. It
 * never drifts, because nothing is ever added to it.
 *
 * The bests are read with a strongly consistent query: this runs straight after the caller wrote a new
 * best, and an eventually-consistent read could miss it and write a standing that lacks the very play
 * that triggered it.
 *
 * No-op for a chart on no current course (a dropped chart has no course to stand on). Hidden courses
 * are written like any other: visibility is applied on read, so un-hiding one later needs no backfill.
 */
export async function refreshCourseStanding(userId: string, alias: string, chartHash: string): Promise<void> {
  const resolved = resolveHole(chartHash);
  if (!resolved) return;
  const { course } = resolved;

  const bests = await queryState<BestItem>(`USER#${userId}`, 'BEST#', { consistent: true });
  const aggregate = aggregateCourse(
    bests.map((b) => ({ chartHash: b.chartHash, totalStrokes: b.totalStrokes, achievedAt: b.timestamp ?? b.updatedAt, playId: b.playId })),
    new Set(course.holes.map((h) => h.chartHash)),
  );
  if (!aggregate) return;

  const totalHoles = course.holes.length;
  const standing: CourseStanding = { userId, alias, ...aggregate };
  await putState(
    `USER#${userId}`,
    `COURSE#${course.slug}`,
    {
      type: 'COURSE_STANDING',
      userId,
      playerAlias: alias,
      courseSlug: course.slug,
      holesCompleted: aggregate.holesCompleted,
      totalHoles,
      totalStrokes: aggregate.totalStrokes,
      achievedAt: aggregate.achievedAt,
    },
    { gsi2pk: coursePartitionKey(course.slug), gsi2sk: courseSortKey(standing, totalHoles) },
  );
}
