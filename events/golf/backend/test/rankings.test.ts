import {
  LEADERBOARD_TARGET_SIZE,
  aggregateCourse,
  computeRankings,
  applyPlayToHoleBest,
  courseSortKey,
  coursePartitionKey,
  holePartitionKey,
  holeSortKey,
  rankCourse,
  rankHole,
  selectNearby,
  type CourseStanding,
  type HoleBest,
} from '../src/rankings';

const NO_RIVALS: ReadonlySet<string> = new Set();
const T = (minute: number) => `2026-10-01T00:${String(minute).padStart(2, '0')}:00.000Z`;

function hole(userId: string, totalStrokes: number, minute = 0): HoleBest {
  return { userId, alias: userId, totalStrokes, achievedAt: T(minute) };
}
function standing(userId: string, holesCompleted: number, totalStrokes: number, minute = 0): CourseStanding {
  return { userId, alias: userId, holesCompleted, totalStrokes, achievedAt: T(minute) };
}
const sortedBy = <R>(rows: R[], key: (r: R) => string) => rows.slice().sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

describe('partition keys', () => {
  it('are namespaced so hole and course partitions cannot collide with each other or with ACTIVITY', () => {
    expect(holePartitionKey('abc123')).toBe('HOLE#abc123');
    expect(coursePartitionKey('beta-pines')).toBe('COURSE#beta-pines');
    expect(holePartitionKey('x')).not.toBe('ACTIVITY');
  });
});

describe('holeSortKey', () => {
  it('orders fewest strokes first', () => {
    const rows = [hole('c', 3000), hole('a', 1000), hole('b', 2000)];
    expect(sortedBy(rows, holeSortKey).map((r) => r.userId)).toEqual(['a', 'b', 'c']);
  });

  // The reason for zero padding: as raw strings "999" > "1000". Strokes cross that boundary constantly
  // (999 raw strokes is 0.999; 1000 is 1.00), so an unpadded key would rank 1.00 ahead of 0.999.
  it('orders numerically across digit-count boundaries', () => {
    const rows = [hole('slower', 1000), hole('faster', 999), hole('tiny', 9)];
    expect(sortedBy(rows, holeSortKey).map((r) => r.userId)).toEqual(['tiny', 'faster', 'slower']);
  });

  it('puts the earlier achiever ahead on an exact tie, matching pack leaderboards', () => {
    const rows = [hole('late', 1500, 30), hole('early', 1500, 5)];
    expect(sortedBy(rows, holeSortKey).map((r) => r.userId)).toEqual(['early', 'late']);
  });

  it('is deterministic for identical rows by falling back to userId', () => {
    const rows = [hole('b', 1500, 5), hole('a', 1500, 5)];
    expect(sortedBy(rows, holeSortKey).map((r) => r.userId)).toEqual(['a', 'b']);
  });

  it('handles a zero-stroke perfect round', () => {
    expect(sortedBy([hole('b', 1), hole('a', 0)], holeSortKey)[0].userId).toBe('a');
  });
});

describe('courseSortKey', () => {
  const HOLES = 18;
  const order = (rows: CourseStanding[]) => sortedBy(rows, (r) => courseSortKey(r, HOLES)).map((r) => r.userId);

  // The worked example from docs/plans/golf-beta-prep.md, section 2.2, verbatim (strokes shown there
  // as the HUD would display them, so 9.02 is 9020 raw). Note topher's 6.53 beats wafles' 10.28 on raw
  // strokes and still ranks below it: topher has played 16 holes and wafles 18.
  it('reproduces the plan’s example board exactly', () => {
    const board = [
      standing('dimo', 18, 9020),
      standing('wafles', 18, 10280),
      standing('topher', 16, 6530),
      standing('snap', 16, 9120),
      standing('heavymode', 15, 7010),
    ];
    expect(order([...board].reverse())).toEqual(['dimo', 'wafles', 'topher', 'snap', 'heavymode']);
    expect(order(board)).toEqual(['dimo', 'wafles', 'topher', 'snap', 'heavymode']);
  });

  it('ranks every completed round above every partial one, however few strokes the partial has', () => {
    expect(order([standing('partial', 17, 1), standing('complete', 18, 9_999_999)])).toEqual(['complete', 'partial']);
  });

  it('ranks partials by holes completed first, not by strokes', () => {
    expect(order([standing('fewer-holes-fewer-strokes', 10, 100), standing('more-holes-more-strokes', 11, 90_000)])).toEqual([
      'more-holes-more-strokes',
      'fewer-holes-fewer-strokes',
    ]);
  });

  it('breaks a holes-completed tie on fewer strokes', () => {
    expect(order([standing('slow', 12, 40_000), standing('fast', 12, 30_000)])).toEqual(['fast', 'slow']);
  });

  it('breaks an exact standing tie in favour of whoever reached it first', () => {
    expect(order([standing('late', 12, 30_000, 40), standing('early', 12, 30_000, 10)])).toEqual(['early', 'late']);
  });

  it('orders strokes numerically across digit-count boundaries', () => {
    expect(order([standing('b', 18, 100_000), standing('a', 18, 99_999)])).toEqual(['a', 'b']);
  });

  it('treats a player with more holes than the course has as complete, not as negative-remaining', () => {
    expect(courseSortKey(standing('x', 20, 5000), 18)).toMatch(/^0#00#/);
  });
});

describe('aggregateCourse', () => {
  const course = new Set(['h1', 'h2', 'h3']);

  it('sums the best on each course hole and counts holes completed', () => {
    const result = aggregateCourse(
      [
        { chartHash: 'h1', totalStrokes: 1000, achievedAt: T(1) },
        { chartHash: 'h2', totalStrokes: 2500, achievedAt: T(9) },
      ],
      course,
    );
    expect(result).toEqual({ holesCompleted: 2, totalStrokes: 3500, achievedAt: T(9) });
  });

  it('ignores charts that are not on the course', () => {
    const result = aggregateCourse(
      [
        { chartHash: 'h1', totalStrokes: 1000, achievedAt: T(1) },
        { chartHash: 'other-course', totalStrokes: 99_999, achievedAt: T(50) },
      ],
      course,
    );
    expect(result).toEqual({ holesCompleted: 1, totalStrokes: 1000, achievedAt: T(1) });
  });

  it('counts a hole once, keeping the fewer-strokes best, if it appears twice', () => {
    const result = aggregateCourse(
      [
        { chartHash: 'h1', totalStrokes: 5000, achievedAt: T(1) },
        { chartHash: 'h1', totalStrokes: 3000, achievedAt: T(2) },
      ],
      course,
    );
    expect(result).toEqual({ holesCompleted: 1, totalStrokes: 3000, achievedAt: T(2) });
  });

  it('returns undefined when the player has nothing on this course', () => {
    expect(aggregateCourse([{ chartHash: 'other', totalStrokes: 1, achievedAt: T(1) }], course)).toBeUndefined();
    expect(aggregateCourse([], course)).toBeUndefined();
  });
});

describe('applyPlayToHoleBest', () => {
  it('takes the play when the player has no stored best', () => {
    const play = hole('me', 2000, 10);
    expect(applyPlayToHoleBest(undefined, play)).toEqual({ best: play, improved: true });
  });

  it('takes the play when it beats the stored best', () => {
    const existing = hole('me', 3000, 1);
    const play = hole('me', 2000, 10);
    expect(applyPlayToHoleBest(existing, play)).toEqual({ best: play, improved: true });
  });

  it('keeps the stored best, and reports no improvement, when the play is worse', () => {
    const existing = hole('me', 2000, 1);
    expect(applyPlayToHoleBest(existing, hole('me', 3000, 10))).toEqual({ best: existing, improved: false });
  });

  it('keeps the earlier best on an exact tie with the player’s own best', () => {
    const existing = hole('me', 2000, 1);
    expect(applyPlayToHoleBest(existing, hole('me', 2000, 10))).toEqual({ best: existing, improved: false });
  });

  // The race: if golf's processor already stored this very play before the image rendered, the stored
  // best and the candidate are the same score, and the answer must match the not-yet-stored case.
  it('reports no improvement when the same score is already stored', () => {
    const play = hole('me', 2000, 10);
    expect(applyPlayToHoleBest(play, play)).toEqual({ best: play, improved: false });
  });
});

describe('rankHole', () => {
  const stored = [hole('a', 1000), hole('b', 2000), hole('c', 3000)];

  it('inserts a new player in position', () => {
    const ranked = rankHole(stored, hole('me', 2500), NO_RIVALS);
    expect(ranked.map((r) => r.entry.userId)).toEqual(['a', 'b', 'me', 'c']);
    expect(ranked.find((r) => r.isSelf)?.rank).toBe(3);
  });

  it('numbers ranks 1..n with no gaps', () => {
    expect(rankHole(stored, hole('me', 2500), NO_RIVALS).map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('replaces the viewer’s own stored row instead of listing them twice', () => {
    const ranked = rankHole([...stored, hole('me', 9000)], hole('me', 1500), NO_RIVALS);
    expect(ranked.filter((r) => r.entry.userId === 'me')).toHaveLength(1);
    expect(ranked.find((r) => r.isSelf)?.rank).toBe(2);
  });

  it('gives the same board whether or not the processor has stored the play yet', () => {
    const play = hole('me', 1500, 20);
    const notStored = rankHole(stored, play, NO_RIVALS);
    const alreadyStored = rankHole([...stored, play], play, NO_RIVALS);
    expect(alreadyStored).toEqual(notStored);
  });

  it('ranks a player who ties the leader behind them if the leader got there first', () => {
    const ranked = rankHole([hole('leader', 1000, 1)], hole('me', 1000, 30), NO_RIVALS);
    expect(ranked.map((r) => r.entry.userId)).toEqual(['leader', 'me']);
  });

  it('flags rivals', () => {
    const ranked = rankHole(stored, hole('me', 2500), new Set(['b']));
    expect(ranked.filter((r) => r.isRival).map((r) => r.entry.userId)).toEqual(['b']);
  });
});

describe('rankCourse', () => {
  const HOLES = 18;

  it('places a completed round above partial ones and a partial among partials by holes then strokes', () => {
    const stored = [standing('done', 18, 70_000), standing('twelve', 12, 20_000), standing('ten', 10, 5_000)];
    const ranked = rankCourse(stored, standing('me', 12, 15_000), HOLES, NO_RIVALS);
    expect(ranked.map((r) => r.entry.userId)).toEqual(['done', 'me', 'twelve', 'ten']);
  });

  it('replaces the viewer’s own stored standing', () => {
    const ranked = rankCourse([standing('me', 5, 1_000), standing('other', 18, 90_000)], standing('me', 18, 80_000), HOLES, NO_RIVALS);
    expect(ranked.filter((r) => r.entry.userId === 'me')).toHaveLength(1);
    expect(ranked.find((r) => r.isSelf)?.rank).toBe(1);
  });
});

describe('selectNearby', () => {
  const board = (n: number, selfRank: number, rivalRanks: number[] = []) =>
    rankHole(
      Array.from({ length: n }, (_, i) => hole(`p${i + 1}`, (i + 1) * 1000)).filter((r) => r.userId !== `p${selfRank}`),
      hole(`p${selfRank}`, selfRank * 1000),
      new Set(rivalRanks.map((r) => `p${r}`)),
    );
  const ids = (rows: { entry: { userId: string } }[]) => rows.map((r) => r.entry.userId);

  it('returns everyone on a board no bigger than a page', () => {
    expect(ids(selectNearby(board(5, 3)))).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('keeps the top two, the viewer and the players either side of the viewer', () => {
    const picked = ids(selectNearby(board(50, 25)));
    for (const expected of ['p1', 'p2', 'p24', 'p25', 'p26']) expect(picked).toContain(expected);
  });

  it(`fills to ${LEADERBOARD_TARGET_SIZE} rows by closeness to the viewer on a long board`, () => {
    expect(selectNearby(board(50, 25))).toHaveLength(LEADERBOARD_TARGET_SIZE);
  });

  it('never exceeds the target when top, neighbours and rivals would all fit separately', () => {
    expect(selectNearby(board(50, 25, [40, 45])).length).toBeLessThanOrEqual(LEADERBOARD_TARGET_SIZE);
  });

  it('includes the top-ranked rival and the rival nearest the viewer', () => {
    const picked = ids(selectNearby(board(50, 25, [10, 27, 44])));
    expect(picked).toContain('p10'); // top rival
    expect(picked).toContain('p27'); // nearest rival
  });

  it('does not pick the same rival for both rival slots', () => {
    // One rival, who is both the top and the nearest - must still appear exactly once.
    const picked = ids(selectNearby(board(50, 25, [30])));
    expect(picked.filter((id) => id === 'p30')).toHaveLength(1);
  });

  it('returns rows in rank order', () => {
    const ranks = selectNearby(board(50, 40, [3])).map((r) => r.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('keeps two different players who share a display name', () => {
    const twins = rankHole(
      [{ userId: 'u1', alias: 'Sam', totalStrokes: 1000, achievedAt: T(1) }],
      { userId: 'u2', alias: 'Sam', totalStrokes: 2000, achievedAt: T(2) },
      NO_RIVALS,
    );
    expect(selectNearby(twins)).toHaveLength(2);
  });
});

describe('computeRankings', () => {
  // A 4-hole course keeps the arithmetic readable. h1 is the hole just played.
  const COURSE = { chartHashes: new Set(['h1', 'h2', 'h3', 'h4']), totalHoles: 4 };
  const base = {
    userId: 'me',
    alias: 'Me',
    chartHash: 'h1',
    playId: 700,
    playedAt: T(30),
    rivalIds: NO_RIVALS,
    course: COURSE,
  };
  const best = (chartHash: string, totalStrokes: number, minute = 0, playId?: number) => ({ chartHash, totalStrokes, achievedAt: T(minute), playId });

  it('ranks a first-ever play on a hole and reports no previous best', () => {
    const result = computeRankings({
      ...base,
      strokes: 2500,
      holeRows: [hole('a', 1000), hole('b', 2000), hole('c', 3000)],
      courseRows: [],
      selfBests: [],
    });
    expect(result.previousBestStrokes).toBeNull();
    expect(result.hole.selfRank).toBe(3);
    expect(result.hole.totalPlayers).toBe(4);
    expect(result.hole.rows.find((r) => r.isSelf)?.isPreviousBest).toBe(false);
  });

  it('reports the stored best as the previous best', () => {
    const result = computeRankings({
      ...base,
      strokes: 1800,
      holeRows: [hole('a', 1000), hole('me', 2200, 1)],
      courseRows: [],
      selfBests: [best('h1', 2200, 1)],
    });
    expect(result.previousBestStrokes).toBe(2200);
    expect(result.hole.selfRank).toBe(2);
    expect(result.hole.rows.find((r) => r.isSelf)?.totalStrokes).toBe(1800);
  });

  // The viewer's row on a board is their best, not their latest. When this play was worse, the row
  // shows an older score, and the page has to flag that or it looks like it disagrees with the card.
  it('shows the old score and flags it when the play did not improve on the best', () => {
    const result = computeRankings({
      ...base,
      strokes: 4000,
      holeRows: [hole('a', 1000), hole('me', 2200, 1)],
      courseRows: [],
      selfBests: [best('h1', 2200, 1)],
    });
    const self = result.hole.rows.find((r) => r.isSelf)!;
    expect(self.totalStrokes).toBe(2200);
    expect(self.isPreviousBest).toBe(true);
  });

  it('gives identical boards whether or not the processor has already stored the play', () => {
    const common = { ...base, strokes: 1800, courseRows: [] as CourseStanding[] };
    const notYet = computeRankings({ ...common, holeRows: [hole('a', 1000), hole('me', 2200, 1)], selfBests: [best('h1', 2200, 1, 650)] });
    // Same play (id 700) already stored as the best - it replaced the 2200.
    const alreadyStored = computeRankings({ ...common, holeRows: [hole('a', 1000), hole('me', 1800, 30)], selfBests: [best('h1', 1800, 30, 700)] });
    expect(alreadyStored.hole.rows).toEqual(notYet.hole.rows);
    expect(alreadyStored.hole.selfRank).toBe(notYet.hole.selfRank);
    expect(alreadyStored.course.rows).toEqual(notYet.course.rows);
  });

  // The regression the above exists for: the stored best equalling the candidate is indistinguishable
  // from "tied my own older best" by score alone, and used to flag this play's own row as an old score.
  it('does not flag the viewer’s row as a previous best when it is this very play', () => {
    const result = computeRankings({
      ...base,
      strokes: 1800,
      holeRows: [hole('me', 1800, 30)],
      courseRows: [],
      selfBests: [best('h1', 1800, 30, 700)],
    });
    expect(result.hole.rows.find((r) => r.isSelf)?.isPreviousBest).toBe(false);
    expect(result.course.rows.find((r) => r.isSelf)?.isPreviousBest).toBe(false);
  });

  it('reports no previous best, rather than 0.00 against itself, when this play is already the stored best', () => {
    const result = computeRankings({ ...base, strokes: 1800, holeRows: [], courseRows: [], selfBests: [best('h1', 1800, 30, 700)] });
    expect(result.previousBestStrokes).toBeNull();
  });

  it('still flags a genuine tie with an older play of the player’s own as a previous best', () => {
    const result = computeRankings({ ...base, strokes: 2200, holeRows: [hole('me', 2200, 1)], courseRows: [], selfBests: [best('h1', 2200, 1, 650)] });
    expect(result.hole.rows.find((r) => r.isSelf)?.isPreviousBest).toBe(true);
  });

  it('builds the course standing from the per-hole bests, with this hole’s best swapped in', () => {
    const result = computeRankings({
      ...base,
      strokes: 1000,
      holeRows: [],
      courseRows: [],
      selfBests: [best('h1', 5000, 1), best('h2', 2000, 2), best('h3', 3000, 3)],
    });
    // 1000 (new h1 best) + 2000 + 3000, three of four holes
    const self = result.course.rows.find((r) => r.isSelf)!;
    expect(self.totalStrokes).toBe(6000);
    expect(self.holesCompleted).toBe(3);
    expect(result.course.selfComplete).toBe(false);
    expect(result.course.holesTotal).toBe(4);
  });

  it('counts a first play on a new hole toward holes completed', () => {
    const result = computeRankings({ ...base, strokes: 1500, holeRows: [], courseRows: [], selfBests: [best('h2', 2000, 2)] });
    expect(result.course.selfHolesCompleted).toBe(2);
  });

  it('marks the course complete when this play finishes the last hole', () => {
    const result = computeRankings({
      ...base,
      strokes: 1000,
      holeRows: [],
      courseRows: [],
      selfBests: [best('h2', 2000), best('h3', 3000), best('h4', 4000)],
    });
    expect(result.course.selfComplete).toBe(true);
    expect(result.course.selfHolesCompleted).toBe(4);
  });

  it('ranks a completed round above partial ones on the course board', () => {
    const result = computeRankings({
      ...base,
      strokes: 1000,
      holeRows: [],
      courseRows: [standing('partial', 3, 100), standing('other-complete', 4, 99_000)],
      selfBests: [best('h2', 2000), best('h3', 3000), best('h4', 4000)],
    });
    expect(result.course.rows.map((r) => r.userId)).toEqual(['me', 'other-complete', 'partial']);
    expect(result.course.selfRank).toBe(1);
  });

  it('does not let a stale stored course row for the viewer override their real bests', () => {
    const result = computeRankings({
      ...base,
      strokes: 1000,
      holeRows: [],
      courseRows: [standing('me', 1, 99_999), standing('a', 4, 50_000)],
      selfBests: [best('h2', 2000), best('h3', 3000), best('h4', 4000)],
    });
    expect(result.course.rows.filter((r) => r.userId === 'me')).toHaveLength(1);
    expect(result.course.rows.find((r) => r.isSelf)?.holesCompleted).toBe(4);
  });

  it('flags the course row as previous when the play changed nothing about the standing', () => {
    const result = computeRankings({
      ...base,
      strokes: 9000, // worse than the stored 2500 on h1
      holeRows: [hole('me', 2500, 1)],
      courseRows: [standing('me', 2, 4500, 2)],
      selfBests: [best('h1', 2500, 1), best('h2', 2000, 2)],
    });
    expect(result.course.rows.find((r) => r.isSelf)?.isPreviousBest).toBe(true);
    expect(result.course.rows.find((r) => r.isSelf)?.totalStrokes).toBe(4500);
  });

  it('does not flag the course row as previous when the play improved the standing', () => {
    const result = computeRankings({
      ...base,
      strokes: 1500,
      holeRows: [hole('me', 2500, 1)],
      courseRows: [standing('me', 2, 4500, 2)],
      selfBests: [best('h1', 2500, 1), best('h2', 2000, 2)],
    });
    expect(result.course.rows.find((r) => r.isSelf)?.isPreviousBest).toBe(false);
  });

  it('curates rows to a page rather than returning the whole board', () => {
    const holeRows = Array.from({ length: 100 }, (_, i) => hole(`p${i}`, (i + 1) * 100));
    const result = computeRankings({ ...base, strokes: 5050, holeRows, courseRows: [], selfBests: [] });
    expect(result.hole.rows.length).toBeLessThanOrEqual(LEADERBOARD_TARGET_SIZE);
    expect(result.hole.totalPlayers).toBe(101);
  });

  it('marks rivals on both boards', () => {
    const result = computeRankings({
      ...base,
      rivalIds: new Set(['a']),
      strokes: 2500,
      holeRows: [hole('a', 1000), hole('b', 2000)],
      courseRows: [standing('a', 4, 10_000)],
      selfBests: [],
    });
    expect(result.hole.rows.find((r) => r.userId === 'a')?.isRival).toBe(true);
    expect(result.course.rows.find((r) => r.userId === 'a')?.isRival).toBe(true);
  });
});
