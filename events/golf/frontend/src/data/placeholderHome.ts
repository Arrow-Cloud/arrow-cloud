// Made-up data for the /beta home page while its real sources don't exist yet. Not real submissions:
// greens and strokes come from the scoring demo's fake plays (dispersionDemoPlays.ts).
import type { ActivityRow, CourseLeaderboard } from '../lib/readApi';
import { DEMO_PLAYS } from './dispersionDemoPlays';

// One course section on the logged-in home page. slug/name/order mirror a course in
// events/golf/config/courses.json, and par is the sum of its holes' pars; the rest has no source yet.
export interface CourseSummary {
  slug: string;
  name: string;
  /** Release order - higher is newer, and the page lists newest first. */
  order: number;
  par: number;
  /** About 10 words. */
  description: string;
  /** 1024x400 (or the same aspect ratio). Undefined until a course has art. */
  bannerUrl?: string;
}

export const PLACEHOLDER_COURSES: CourseSummary[] = [
  {
    slug: 'beta-hills',
    name: 'Beta Hills',
    order: 1,
    par: 166,
    description: 'A fun and easy course to introduce you to the new scoring system.',
    bannerUrl: '/img/acitgbh-bn.png',
  },
  {
    slug: 'beta-pines',
    name: 'Beta Pines',
    order: 2,
    par: 76,
    description: 'More challenging content to test your limits on golf scoring.',
    bannerUrl: '/img/acitgbp-bn.png',
  },
];

const PLACEHOLDER_PLAYERS = [
  { alias: 'Wafles', artist: 'horsegiirL', song: 'girl math', hole: 4, minutesAgo: 3, par: 5 },
  { alias: 'freyja', artist: 'Placeholder Artist', song: 'Placeholder Song', hole: 7, minutesAgo: 11, par: 3 },
  { alias: 'DRILLBOT', artist: 'Placeholder Artist', song: 'Placeholder Song', hole: 2, minutesAgo: 26, par: 4 },
];

// Shaped exactly like GET /activity rows, so swapping in real data only changes where they come
// from. Pass a course to make every row a play on that course (the per-course feeds).
export function placeholderActivity(course?: Pick<CourseSummary, 'slug' | 'name'>): ActivityRow[] {
  const courses = course ? [course] : PLACEHOLDER_COURSES;
  return PLACEHOLDER_PLAYERS.map((p, i) => {
    const play = DEMO_PLAYS[i % DEMO_PLAYS.length];
    const c = courses[i % courses.length];
    return {
      playId: -(i + 1),
      userId: `placeholder-${i}`,
      playerAlias: p.alias,
      profileImageUrl: null,
      timestamp: new Date(Date.now() - p.minutesAgo * 60_000).toISOString(),
      courseSlug: c.slug,
      courseName: c.name,
      holeNumber: p.hole,
      // Any string seeds a green; prefixing the course gives each course's feed its own shapes.
      chartHash: `${c.slug}-${play.greenSeed}`,
      songName: p.song,
      artist: p.artist,
      par: p.par,
      totalStrokes: play.totalStrokes,
      noteCount: play.noteStrokes.length,
      noteStrokes: play.noteStrokes,
    };
  });
}

// Strokes over/under par for the placeholder boards, best first. Starts like the mockup (a big lead,
// one at par, a cluster at +2) and runs to 3 pages so the pager shows. Two long aliases check that
// names truncate in both the podium and compact rows.
const PLACEHOLDER_BOARD = [
  ['Wafles', -23],
  ['freyja', 0],
  ['reallylongusername', 1],
  ['DRILLBOT', 2],
  ['dimo', 2],
  ['sorae', 2],
  ['valgrind', 2],
  ['anotherreallylongusername', 2],
  ['Flicks', 2.4],
  ['caruku', 3.1],
  ['DarkCry1534', 4],
  ['moonbeam', 5.25],
  ['quintessa', 6.8],
  ['stepstep', 8.1],
  ['halfnote', 9.9],
  ['boogiebot', 12.3],
  ['ghostfoot', 15],
  ['tapdancer', 18.75],
] as const;

// Shaped like GET /courses/{slug}/leaderboard, so the dev placeholder goes through the same code as the real thing.
export function placeholderCourseLeaderboard(course: Pick<CourseSummary, 'slug' | 'name' | 'par'>): CourseLeaderboard {
  const rows = PLACEHOLDER_BOARD.map(([alias, delta], i) => ({
    rank: i + 1,
    userId: `placeholder-lb-${i}`,
    alias,
    profileImageUrl: null,
    totalStrokes: Math.round((course.par + delta) * 1000),
    holesCompleted: 18,
    complete: true,
  }));
  return { course: { slug: course.slug, name: course.name, holesTotal: 18 }, totalPlayers: rows.length, limit: 100, offset: 0, rows };
}
