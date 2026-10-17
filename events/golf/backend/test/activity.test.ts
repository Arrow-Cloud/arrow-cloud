import type { PlayItem } from '../src/shared';

const HILLS_HOLE = 'hills1';
const HILLS_OTHER_HOLE = 'hills2';
const PINES_HOLE = 'pines1';
const HIDDEN_HOLE = 'hidden1';

let feed: PlayItem[] = [];
jest.mock('../src/shared', () => ({
  ...jest.requireActual('../src/shared'),
  queryGsiPaginated: jest.fn(async () => ({ items: feed, cursor: undefined })),
  getNoteStrokes: jest.fn(async () => new Map()),
}));

// courses.ts imports a JSON file the api's jest config can't compile, so it is replaced with a small
// fixed set: two visible courses and one hidden one.
jest.mock('../src/courses', () => {
  const hole = (holeNumber: number, chartHash: string) => ({ holeNumber, chartHash, displayName: chartHash, artist: 'A', meter: 10, par: 3 });
  const courses = [
    { slug: 'beta-hills', name: 'Hills', order: 1, hidden: false, holes: [hole(1, 'hills1'), hole(2, 'hills2')] },
    { slug: 'beta-pines', name: 'Pines', order: 2, hidden: false, holes: [hole(1, 'pines1')] },
    { slug: 'alpha-test', name: 'Alpha', order: 98, hidden: true, holes: [hole(1, 'hidden1')] },
  ];
  const visible = courses.filter((c) => !c.hidden);
  return {
    COURSES: courses,
    VISIBLE_COURSES: visible,
    isVisibleCourseSlug: (slug: string) => visible.some((c) => c.slug === slug),
    resolveVisibleHole: (chartHash: string) => {
      for (const course of visible) {
        const h = course.holes.find((x) => x.chartHash === chartHash);
        if (h) return { course, hole: h };
      }
      return undefined;
    },
  };
});

import { handler } from '../src/read-api';

let nextId = 1;
function play(userId: string, chartHash: string, extra: Partial<PlayItem> = {}): PlayItem {
  return {
    pk: `USER#${userId}`,
    sk: `PLAY#${nextId}`,
    type: 'PLAY',
    playId: nextId++,
    userId,
    playerAlias: userId,
    chartHash,
    totalStrokes: 3000,
    noteCount: 100,
    timestamp: '2026-01-01T00:00:00.000Z',
    eligible: true,
    passed: true,
    musicRate: 1,
    usedAutoplay: false,
    ...extra,
  };
}

async function activity(params: Record<string, string>) {
  const res = await handler({ requestContext: { http: { method: 'GET', path: '/activity' } }, rawPath: '/activity', queryStringParameters: params });
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

describe('GET /activity chartHash filter', () => {
  beforeEach(() => {
    // Newest first, as the index returns it.
    feed = [
      play('ana', HILLS_OTHER_HOLE),
      play('bo', HILLS_HOLE),
      play('ana', HILLS_HOLE), // ana's older play on the filtered hole, behind a newer one elsewhere
      play('cy', PINES_HOLE),
      play('di', HILLS_HOLE, { eligible: false }),
    ];
  });

  it('returns only plays on that hole', async () => {
    const { status, body } = await activity({ chartHash: HILLS_HOLE, limit: '10' });
    expect(status).toBe(200);
    expect(body.data.map((r: { userId: string }) => r.userId)).toEqual(['bo', 'ana']);
    expect(body.data.every((r: { chartHash: string }) => r.chartHash === HILLS_HOLE)).toBe(true);
  });

  // The filter runs before a player is marked as seen, so ana's newer play on another hole must not
  // hide her play on this one.
  it("uses a player's latest play on the hole, not their latest play overall", async () => {
    const { body } = await activity({ chartHash: HILLS_HOLE, limit: '10' });
    const ana = body.data.find((r: { userId: string }) => r.userId === 'ana');
    expect(ana.chartHash).toBe(HILLS_HOLE);
  });

  it('still returns one row per player', async () => {
    feed = [play('ana', HILLS_HOLE), play('ana', HILLS_HOLE), play('bo', HILLS_HOLE)];
    const { body } = await activity({ chartHash: HILLS_HOLE, limit: '10' });
    expect(body.data.map((r: { userId: string }) => r.userId)).toEqual(['ana', 'bo']);
  });

  it('still leaves out ineligible plays', async () => {
    const { body } = await activity({ chartHash: HILLS_HOLE, limit: '10' });
    expect(body.data.map((r: { userId: string }) => r.userId)).not.toContain('di');
  });

  it('is a 400 for an unknown hash', async () => {
    const { status, body } = await activity({ chartHash: 'deadbeefdeadbeef' });
    expect(status).toBe(400);
    expect(body.error).toMatch(/Unknown chartHash/);
  });

  // A hidden course's charts are never public, so naming one must not confirm it exists.
  it('is a 400 for a hidden-course hash, same as an unknown one', async () => {
    feed = [play('ana', HIDDEN_HOLE)];
    const { status, body } = await activity({ chartHash: HIDDEN_HOLE });
    expect(status).toBe(400);
    expect(body.error).toMatch(/Unknown chartHash/);
  });

  it('combines with course: a hole on another course returns nothing', async () => {
    const { status, body } = await activity({ chartHash: HILLS_HOLE, course: 'beta-pines', limit: '10' });
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('combines with userIds', async () => {
    const { body } = await activity({ chartHash: HILLS_HOLE, userIds: 'ana', limit: '10' });
    expect(body.data.map((r: { userId: string }) => r.userId)).toEqual(['ana']);
  });

  it('without the parameter, behaves as before', async () => {
    const { body } = await activity({ limit: '10' });
    expect(body.data.map((r: { userId: string }) => r.userId)).toEqual(['ana', 'bo', 'cy']);
  });
});
