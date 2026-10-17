const mockGetViewer = jest.fn();
jest.mock('../src/auth', () => ({ getViewer: (...args: unknown[]) => mockGetViewer(...args) }));

const mockQueryState = jest.fn();
jest.mock('../src/shared', () => ({
  ...jest.requireActual('../src/shared'),
  queryState: (...args: unknown[]) => mockQueryState(...args),
}));

// courses.ts imports a JSON file the api's jest config can't compile, so it is replaced with a small fixed
// set: two visible courses and one hidden one.
jest.mock('../src/courses', () => {
  const holeBanner: Record<string, string> = { h1: 'https://assets.example/holes/h1.webp' };
  const hole = (holeNumber: number, chartHash: string) => ({
    holeNumber,
    chartHash,
    displayName: `Song ${chartHash}`,
    artist: 'A',
    meter: 10,
    par: 3,
    bannerUrl: holeBanner[chartHash] ?? null,
  });
  const courses = [
    { slug: 'beta-pines', name: 'Pines', order: 2, hidden: false, description: 'Harder.', bannerUrl: 'https://assets.example/p.png', holes: [hole(1, 'p1')] },
    {
      slug: 'beta-hills',
      name: 'Hills',
      order: 1,
      hidden: false,
      description: 'Easier.',
      bannerUrl: 'https://assets.example/h.png',
      holes: [hole(1, 'h1'), hole(2, 'h2')],
    },
    { slug: 'alpha-test', name: 'Alpha', order: 98, hidden: true, description: null, bannerUrl: null, holes: [hole(1, 'a1')] },
  ];
  return { COURSES: courses, VISIBLE_COURSES: courses.filter((c) => !c.hidden), isVisibleCourseSlug: () => true, resolveVisibleHole: () => undefined };
});

import { handler } from '../src/read-api';

async function get(path: string, query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const res = await handler({ requestContext: { http: { method: 'GET', path } }, rawPath: path, queryStringParameters: query, headers });
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

describe('GET /courses', () => {
  it('lists visible courses in order with name, banner and description', async () => {
    const { status, body } = await get('/courses');
    expect(status).toBe(200);
    expect(body.courses.map((c: { slug: string }) => c.slug)).toEqual(['beta-hills', 'beta-pines']);
    expect(body.courses[0]).toMatchObject({ name: 'Hills', description: 'Easier.', bannerUrl: 'https://assets.example/h.png' });
  });

  it('does not mention the hidden course', async () => {
    expect(JSON.stringify((await get('/courses')).body)).not.toMatch(/alpha/i);
  });
});

describe('GET /courses/{slug}', () => {
  it('returns the course with its holes', async () => {
    const { status, body } = await get('/courses/beta-hills');
    expect(status).toBe(200);
    expect(body.course).toMatchObject({
      slug: 'beta-hills',
      name: 'Hills',
      description: 'Easier.',
      bannerUrl: 'https://assets.example/h.png',
      holesTotal: 2,
      parTotal: 6,
    });
    expect(body.course.holes.map((h: { chartHash: string }) => h.chartHash)).toEqual(['h1', 'h2']);
    expect(body.course.holes.map((h: { bannerUrl: string | null }) => h.bannerUrl)).toEqual(['https://assets.example/holes/h1.webp', null]);
  });

  it('is a 404 for an unknown course', async () => {
    const { status, body } = await get('/courses/nope');
    expect(status).toBe(404);
    expect(body.error).toBe('Unknown course');
  });

  it('is the same 404 for a hidden course', async () => {
    expect(await get('/courses/alpha-test')).toEqual(await get('/courses/nope'));
  });

  it('does not shadow the leaderboard route', async () => {
    // Anything under /courses/{slug}/ is a different route; it must not be read as a slug.
    const { status } = await get('/courses/beta-hills/leaderboard/extra');
    expect(status).toBe(404);
  });
});

describe('GET /courses/{slug} for a logged-in caller', () => {
  const best = (chartHash: string, totalStrokes: number) => ({
    chartHash,
    totalStrokes,
    updatedAt: '2026-01-02T00:00:00.000Z',
    timestamp: '2026-01-01T00:00:00.000Z',
  });
  const auth = { authorization: 'Bearer t' };

  beforeEach(() => {
    mockQueryState.mockReset();
    mockGetViewer.mockReset();
    mockGetViewer.mockResolvedValue({ userId: 'u1' });
  });

  it('has no bests, and reads nothing, for an anonymous caller', async () => {
    mockGetViewer.mockResolvedValue(null);
    const { status, body } = await get('/courses/beta-hills');
    expect(status).toBe(200);
    expect(body).not.toHaveProperty('bests');
    expect(mockQueryState).not.toHaveBeenCalled();
  });

  it('ignores a userId query param - identity comes only from the token', async () => {
    mockGetViewer.mockResolvedValue(null);
    const { body } = await get('/courses/beta-hills', { userId: 'someone-else' });
    expect(body).not.toHaveProperty('bests');
    expect(mockQueryState).not.toHaveBeenCalled();
  });

  it("returns the token's player's bests for this course's holes, in hole order, from one read", async () => {
    mockQueryState.mockResolvedValue([best('h2', 4100), best('p1', 9999), best('h1', 2500)]);
    const { status, body } = await get('/courses/beta-hills', {}, auth);
    expect(status).toBe(200);
    expect(mockGetViewer).toHaveBeenCalledWith(auth);
    expect(mockQueryState).toHaveBeenCalledTimes(1);
    expect(mockQueryState).toHaveBeenCalledWith('USER#u1', 'BEST#');
    expect(body.bests).toEqual([
      { chartHash: 'h1', totalStrokes: 2500, achievedAt: '2026-01-01T00:00:00.000Z' },
      { chartHash: 'h2', totalStrokes: 4100, achievedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(body.course.slug).toBe('beta-hills');
  });

  it('omits holes the player has not played, and is empty for a new player', async () => {
    mockQueryState.mockResolvedValue([best('h2', 4100)]);
    expect((await get('/courses/beta-hills', {}, auth)).body.bests.map((b: { chartHash: string }) => b.chartHash)).toEqual(['h2']);
    mockQueryState.mockResolvedValue([]);
    expect((await get('/courses/beta-hills', {}, auth)).body.bests).toEqual([]);
  });

  it('is still the same 404 for unknown and hidden courses, without reading the table', async () => {
    expect(await get('/courses/alpha-test', {}, auth)).toEqual(await get('/courses/nope', {}, auth));
    expect(mockQueryState).not.toHaveBeenCalled();
  });
});
