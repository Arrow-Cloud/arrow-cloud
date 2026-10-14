import {
  DEFAULT_LEADERBOARD_LIMIT,
  MAX_LEADERBOARD_LIMIT,
  buildCourseLeaderboard,
  buildCoursesIndex,
  buildHoleLeaderboard,
  findVisibleCourse,
  parsePaging,
  visibleCourses,
  type CourseConfig,
  type HoleConfig,
} from '../src/leaderboards';
import { rankCourseBoard, rankHoleBoard, type CourseStanding, type HoleBest } from '../src/rankings';

const T = (minute: number) => `2026-10-01T00:${String(minute).padStart(2, '0')}:00.000Z`;

function hole(n: number, par: number | null = 3): HoleConfig {
  return { holeNumber: n, chartHash: `hash${n}`, displayName: `Song ${n}`, artist: `Artist ${n}`, meter: 10, par };
}
function course(slug: string, holes: HoleConfig[], overrides: Partial<CourseConfig> = {}): CourseConfig {
  return { slug, name: slug.toUpperCase(), order: 1, hidden: false, holes, ...overrides };
}
const standing = (userId: string, holesCompleted: number, totalStrokes: number, minute = 0): CourseStanding => ({
  userId,
  alias: `alias-${userId}`,
  holesCompleted,
  totalStrokes,
  achievedAt: T(minute),
});
const best = (userId: string, totalStrokes: number, minute = 0): HoleBest => ({ userId, alias: `alias-${userId}`, totalStrokes, achievedAt: T(minute) });

describe('parsePaging', () => {
  it('defaults to the first page', () => {
    expect(parsePaging({})).toEqual({ limit: DEFAULT_LEADERBOARD_LIMIT, offset: 0 });
  });

  it('reads valid values', () => {
    expect(parsePaging({ limit: '10', offset: '30' })).toEqual({ limit: 10, offset: 30 });
  });

  it('caps the limit, so one request cannot ask for an entire large board', () => {
    expect(parsePaging({ limit: '5000' }).limit).toBe(MAX_LEADERBOARD_LIMIT);
  });

  // A leaderboard page that 400s because someone typed ?limit=abc is worse than one that shows page one.
  it.each([['abc'], [''], ['0'], ['-4'], ['NaN']])('falls back to the default limit for %p', (limit) => {
    expect(parsePaging({ limit }).limit).toBe(DEFAULT_LEADERBOARD_LIMIT);
  });

  it.each([['abc'], ['-1'], ['']])('falls back to offset 0 for %p', (offset) => {
    expect(parsePaging({ offset }).offset).toBe(0);
  });

  it('allows an offset of 0 explicitly', () => {
    expect(parsePaging({ offset: '0' }).offset).toBe(0);
  });
});

describe('course visibility', () => {
  const courses = [
    course('b-course', [hole(1)], { order: 2 }),
    course('a-course', [hole(1)], { order: 1 }),
    course('secret', [hole(1)], { hidden: true, order: 3 }),
  ];

  it('lists visible courses in display order and leaves out hidden ones', () => {
    expect(visibleCourses(courses).map((c) => c.slug)).toEqual(['a-course', 'b-course']);
  });

  it('finds a visible course by slug', () => {
    expect(findVisibleCourse(courses, 'b-course')?.slug).toBe('b-course');
  });

  // Naming a hidden course must reveal nothing, so it has to look exactly like an unknown one.
  it('treats a hidden course the same as an unknown one', () => {
    expect(findVisibleCourse(courses, 'secret')).toBeUndefined();
    expect(findVisibleCourse(courses, 'does-not-exist')).toBeUndefined();
  });
});

describe('buildCoursesIndex', () => {
  it('describes each visible course and its holes', () => {
    const index = buildCoursesIndex([course('pines', [hole(1, 3), hole(2, 4)])]);
    expect(index.courses).toHaveLength(1);
    expect(index.courses[0]).toMatchObject({ slug: 'pines', name: 'PINES', holesTotal: 2, parTotal: 7 });
    expect(index.courses[0].holes[1]).toEqual({ holeNumber: 2, chartHash: 'hash2', songName: 'Song 2', artist: 'Artist 2', meter: 10, par: 4 });
  });

  it('never includes a hidden course', () => {
    const index = buildCoursesIndex([course('visible', [hole(1)]), course('secret', [hole(1)], { hidden: true })]);
    expect(index.courses.map((c) => c.slug)).toEqual(['visible']);
    expect(JSON.stringify(index)).not.toContain('secret');
  });

  // A partial total would read as the real one, so a course with any unpar'd hole reports none.
  it('reports no par total when any hole has no par', () => {
    expect(buildCoursesIndex([course('half-par', [hole(1, 3), hole(2, null)])]).courses[0].parTotal).toBeNull();
  });

  it('serves the cleaned song name, not the raw simfile title', () => {
    const raw: HoleConfig = { ...hole(1), displayName: 'Chemicals' };
    expect(buildCoursesIndex([course('c', [raw])]).courses[0].holes[0].songName).toBe('Chemicals');
  });
});

describe('rankHoleBoard / rankCourseBoard', () => {
  it('rank a hole from the rows alone, whatever order they arrive in', () => {
    const rows = [best('c', 3000), best('a', 1000), best('b', 2000)];
    expect(rankHoleBoard(rows).map((r) => [r.rank, r.entry.userId])).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    expect(rankHoleBoard([...rows].reverse()).map((r) => r.entry.userId)).toEqual(['a', 'b', 'c']);
  });

  it('rank a course from the rows alone, finished rounds first', () => {
    const rows = [standing('partial', 17, 1), standing('done', 18, 90_000)];
    expect(rankCourseBoard(rows, 18).map((r) => r.entry.userId)).toEqual(['done', 'partial']);
  });

  // The stored course sort key bakes in the hole count from when it was written. These boards are derived
  // against the hole count NOW, so a course that changed size is ordered correctly without a rewrite.
  it('use the course’s current hole count to decide who has finished', () => {
    const rows = [standing('seventeen', 17, 10_000), standing('eighteen', 18, 90_000)];
    // On an 18-hole course, 18 holes is a finished round and outranks 17 holes however few strokes.
    expect(rankCourseBoard(rows, 18).map((r) => r.entry.userId)).toEqual(['eighteen', 'seventeen']);
    // If the course shrinks to 17 holes, the 17-hole player has finished too, and now wins on strokes.
    expect(rankCourseBoard(rows, 17).map((r) => r.entry.userId)).toEqual(['seventeen', 'eighteen']);
  });
});

describe('buildHoleLeaderboard', () => {
  const pines = course('pines', [hole(1), hole(2)]);
  const rows = Array.from({ length: 12 }, (_, i) => best(`u${i}`, (i + 1) * 100, i));

  it('names the hole it describes', () => {
    const board = buildHoleLeaderboard({ course: pines, hole: pines.holes[1], rows, limit: 5, offset: 0 });
    expect(board.hole).toEqual({ chartHash: 'hash2', courseSlug: 'pines', courseName: 'PINES', holeNumber: 2, songName: 'Song 2', artist: 'Artist 2', par: 3 });
  });

  it('returns the first page, fewest strokes first, and counts the whole board', () => {
    const board = buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows, limit: 5, offset: 0 });
    expect(board.totalPlayers).toBe(12);
    expect(board.rows.map((r) => [r.rank, r.userId])).toEqual([
      [1, 'u0'],
      [2, 'u1'],
      [3, 'u2'],
      [4, 'u3'],
      [5, 'u4'],
    ]);
  });

  // The thing a pager gets wrong most easily: page two must continue the numbering, not restart it.
  it('keeps ranks absolute across pages', () => {
    const page2 = buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows, limit: 5, offset: 5 });
    expect(page2.rows.map((r) => r.rank)).toEqual([6, 7, 8, 9, 10]);
    expect(page2.rows[0].userId).toBe('u5');
  });

  it('returns a short last page', () => {
    expect(buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows, limit: 5, offset: 10 }).rows.map((r) => r.rank)).toEqual([11, 12]);
  });

  it('returns no rows, but the true total, when the offset is past the end', () => {
    const board = buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows, limit: 5, offset: 500 });
    expect(board.rows).toEqual([]);
    expect(board.totalPlayers).toBe(12);
  });

  it('handles an empty board', () => {
    const board = buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows: [], limit: 5, offset: 0 });
    expect(board).toMatchObject({ totalPlayers: 0, rows: [] });
  });

  it('echoes the paging it applied, so a client can build its next request', () => {
    const board = buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows, limit: 5, offset: 5 });
    expect([board.limit, board.offset]).toEqual([5, 5]);
  });

  it('puts the earlier achiever first on an exact tie, as everywhere else', () => {
    const tied = [best('late', 1000, 30), best('early', 1000, 5)];
    expect(buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows: tied, limit: 5, offset: 0 }).rows.map((r) => r.userId)).toEqual(['early', 'late']);
  });

  it('carries when each best was set', () => {
    expect(buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows: [best('a', 1000, 7)], limit: 5, offset: 0 }).rows[0].achievedAt).toBe(T(7));
  });
});

describe('buildCourseLeaderboard', () => {
  const eighteen = course(
    'hills',
    Array.from({ length: 18 }, (_, i) => hole(i + 1)),
  );

  // The plan's own worked example (docs/plans/golf-beta-prep.md section 2.2), as a served board.
  it('orders the plan’s example board: finished rounds first, then by holes completed', () => {
    const rows = [
      standing('heavymode', 15, 7010),
      standing('dimo', 18, 9020),
      standing('snap', 16, 9120),
      standing('wafles', 18, 10280),
      standing('topher', 16, 6530),
    ];
    const board = buildCourseLeaderboard({ course: eighteen, rows, limit: 10, offset: 0 });
    expect(board.rows.map((r) => r.userId)).toEqual(['dimo', 'wafles', 'topher', 'snap', 'heavymode']);
  });

  it('marks a round complete only when every hole is done', () => {
    const board = buildCourseLeaderboard({ course: eighteen, rows: [standing('done', 18, 100), standing('almost', 17, 100)], limit: 10, offset: 0 });
    expect(board.rows.map((r) => [r.userId, r.complete])).toEqual([
      ['done', true],
      ['almost', false],
    ]);
  });

  it('reports the course and its hole count', () => {
    expect(buildCourseLeaderboard({ course: eighteen, rows: [], limit: 10, offset: 0 }).course).toEqual({ slug: 'hills', name: 'HILLS', holesTotal: 18 });
  });

  it('keeps ranks absolute across pages', () => {
    const rows = Array.from({ length: 8 }, (_, i) => standing(`u${i}`, 18, (i + 1) * 1000, i));
    const board = buildCourseLeaderboard({ course: eighteen, rows, limit: 3, offset: 3 });
    expect(board.rows.map((r) => [r.rank, r.userId])).toEqual([
      [4, 'u3'],
      [5, 'u4'],
      [6, 'u5'],
    ]);
    expect(board.totalPlayers).toBe(8);
  });

  it('carries holes completed and total strokes on each row', () => {
    const row = buildCourseLeaderboard({ course: eighteen, rows: [standing('a', 5, 12_345)], limit: 10, offset: 0 }).rows[0];
    expect(row).toMatchObject({ rank: 1, userId: 'a', alias: 'alias-a', totalStrokes: 12_345, holesCompleted: 5, complete: false });
  });

  // The board must not depend on the order DynamoDB happened to return rows in.
  it('is the same board whatever order the rows arrive in', () => {
    const rows = [standing('a', 18, 5000), standing('b', 9, 100), standing('c', 18, 4000), standing('d', 9, 50)];
    const forward = buildCourseLeaderboard({ course: eighteen, rows, limit: 10, offset: 0 });
    const reversed = buildCourseLeaderboard({ course: eighteen, rows: [...rows].reverse(), limit: 10, offset: 0 });
    expect(reversed).toEqual(forward);
    expect(forward.rows.map((r) => r.userId)).toEqual(['c', 'a', 'd', 'b']);
  });
});

// The leaderboard routes are meant to be a raw board: every player, in order, with nothing chosen for the
// viewer. These pin that structurally, so a later "improvement" that windows, highlights or de-duplicates a
// board has to break a test first.
describe('leaderboards are raw: nothing skipped, nothing curated', () => {
  const pines = course(
    'pines',
    Array.from({ length: 18 }, (_, i) => hole(i + 1)),
  );
  const holeRows = Array.from({ length: 23 }, (_, i) => best(`u${i}`, (i + 1) * 37, i));
  const courseRows = Array.from({ length: 23 }, (_, i) => standing(`u${i}`, i % 2 === 0 ? 18 : 9, (i + 1) * 1000, i));

  const walk = <R extends { rank: number }>(fetchPage: (offset: number) => { rows: R[] }, total: number, limit: number) => {
    const pages: R[][] = [];
    for (let offset = 0; offset < total; offset += limit) pages.push(fetchPage(offset).rows);
    return pages;
  };

  it('hole board: walking every page yields ranks 1..n exactly, with no gap anywhere', () => {
    const pages = walk((offset) => buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows: holeRows, limit: 5, offset }), 23, 5);
    expect(pages.flat().map((r) => r.rank)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
  });

  it('course board: walking every page yields ranks 1..n exactly, with no gap anywhere', () => {
    const pages = walk((offset) => buildCourseLeaderboard({ course: pines, rows: courseRows, limit: 5, offset }), 23, 5);
    expect(pages.flat().map((r) => r.rank)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
  });

  it('every page is a run of consecutive ranks starting at offset + 1', () => {
    for (const offset of [0, 5, 10, 15, 20]) {
      const rows = buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows: holeRows, limit: 5, offset }).rows;
      expect(rows.map((r) => r.rank)).toEqual(rows.map((_, i) => offset + i + 1));
    }
  });

  it('hole board is in strokes order, fewest first, from the first rank to the last', () => {
    const rows = buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows: [...holeRows].reverse(), limit: 100, offset: 0 }).rows;
    expect(rows.map((r) => r.totalStrokes)).toEqual([...rows.map((r) => r.totalStrokes)].sort((a, b) => a - b));
    expect(rows).toHaveLength(23);
  });

  it('a small board is returned whole - not trimmed to a window', () => {
    expect(buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows: holeRows, limit: 100, offset: 0 }).rows).toHaveLength(23);
    expect(buildCourseLeaderboard({ course: pines, rows: courseRows, limit: 100, offset: 0 }).rows).toHaveLength(23);
  });

  // A board has no viewer: no isSelf, no isRival, no isPreviousBest. A consumer that wants to highlight a
  // player does it by userId. If a row ever gains a field, this fails and the README has to be updated with it.
  it('hole rows carry exactly the documented fields and no viewer or rival markers', () => {
    const row = buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows: holeRows, limit: 1, offset: 0 }).rows[0];
    expect(Object.keys(row).sort()).toEqual(['achievedAt', 'alias', 'profileImageUrl', 'rank', 'totalStrokes', 'userId']);
  });

  it('course rows carry exactly the documented fields and no viewer or rival markers', () => {
    const row = buildCourseLeaderboard({ course: pines, rows: courseRows, limit: 1, offset: 0 }).rows[0];
    expect(Object.keys(row).sort()).toEqual(['alias', 'complete', 'holesCompleted', 'profileImageUrl', 'rank', 'totalStrokes', 'userId']);
  });

  // The avatar is stored data like the alias: passed through untouched, and null (not undefined, which JSON would
  // drop) for a player with none or a row written before avatars were stored.
  it("passes each row's avatar through, and is null when there is none", () => {
    const avatar = 'https://assets.example.test/profile-images/u1/a.png';
    const hole = buildHoleLeaderboard({
      course: pines,
      hole: pines.holes[0],
      rows: [
        { userId: 'u1', alias: 'with', profileImageUrl: avatar, totalStrokes: 1000, achievedAt: '2026-10-01T00:00:00.000Z' },
        { userId: 'u2', alias: 'null', profileImageUrl: null, totalStrokes: 2000, achievedAt: '2026-10-01T00:00:00.000Z' },
        { userId: 'u3', alias: 'absent', totalStrokes: 3000, achievedAt: '2026-10-01T00:00:00.000Z' },
      ],
      limit: 10,
      offset: 0,
    });
    expect(hole.rows.map((r) => r.profileImageUrl)).toEqual([avatar, null, null]);

    const course = buildCourseLeaderboard({
      course: pines,
      rows: [
        { userId: 'u1', alias: 'with', profileImageUrl: avatar, holesCompleted: 1, totalStrokes: 1000, achievedAt: '2026-10-01T00:00:00.000Z' },
        { userId: 'u3', alias: 'absent', holesCompleted: 1, totalStrokes: 3000, achievedAt: '2026-10-01T00:00:00.000Z' },
      ],
      limit: 10,
      offset: 0,
    });
    expect(course.rows.map((r) => r.profileImageUrl)).toEqual([avatar, null]);
  });

  // Two players with the same alias are two rows. De-duplicating by name would drop one and skip a rank.
  it('keeps two different players who share an alias, as two ranks', () => {
    const twins = [
      { ...best('u1', 100, 1), alias: 'Sam' },
      { ...best('u2', 200, 2), alias: 'Sam' },
    ];
    expect(buildHoleLeaderboard({ course: pines, hole: pines.holes[0], rows: twins, limit: 10, offset: 0 }).rows.map((r) => r.rank)).toEqual([1, 2]);
  });
});
