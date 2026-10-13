import { readFileSync } from 'fs';
import * as path from 'path';

// courses.json is read from disk rather than imported: these tests run under the api's jest, whose
// tsconfig can't import JSON. It is also hand-maintained at the moment (scripts/build-golf-courses.ts
// can't regenerate it until its par inputs are back in scripts/data), so a hand-edit is exactly how a
// defect gets in - these are the invariants worth pinning.
interface Hole {
  holeNumber: number;
  chartHash: string;
  displayName: string;
  artist: string;
}
interface Course {
  slug: string;
  hidden: boolean;
  holes: Hole[];
}
const courses = (JSON.parse(readFileSync(path.join(__dirname, '../../config/courses.json'), 'utf-8')) as { courses: Course[] }).courses;
const allHoles = courses.flatMap((course) => course.holes.map((hole) => ({ course: course.slug, ...hole })));

describe('events/golf/config/courses.json', () => {
  // Simfile tags carry escape sequences (a backslash before a character that would otherwise be syntax).
  // displayName and artist are served as-is by /activity and /rankings and drawn on the result images, so
  // a leftover escape reaches players: "En\-vy" went out on the live feed. The raw songName and songFolder
  // fields are deliberately left as written and are never served, so they are not checked.
  it('has no simfile escape sequences in the fields players see', () => {
    const offenders = allHoles.flatMap((h) =>
      (['displayName', 'artist'] as const)
        .filter((field) => h[field].includes('\\'))
        .map((field) => `${h.course} hole ${h.holeNumber} ${field}: ${JSON.stringify(h[field])}`),
    );
    expect(offenders).toEqual([]);
  });

  // The chart hash is how a play is resolved to its course and hole. A duplicate would make one of the two
  // holes unreachable and silently attribute its plays to the other.
  it('gives every chart hash to exactly one hole', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const h of allHoles) {
      const where = `${h.course} hole ${h.holeNumber}`;
      if (seen.has(h.chartHash)) duplicates.push(`${h.chartHash}: ${seen.get(h.chartHash)} and ${where}`);
      seen.set(h.chartHash, where);
    }
    expect(duplicates).toEqual([]);
  });

  // Hole numbers are labels players see ("HOLE 8") and are explicit indices, not derived from order.
  it.each(courses.map((course) => [course.slug, course] as const))('numbers the holes of %s from 1 with no gaps or repeats', (_slug, course) => {
    expect(course.holes.map((h) => h.holeNumber)).toEqual(course.holes.map((_, i) => i + 1));
  });
});
