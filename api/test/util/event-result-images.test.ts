import type { Play } from '../../prisma/generated';
import type { PlaySubmission } from '../../src/utils/scoring';
import { MAX_RESULT_IMAGES, computeEventResultImages, eventResultImageSlots, limitResultImages } from '../../src/utils/event-result-images';
import { renderGolfResultImage } from '../../src/utils/golf-result-image';
import { renderGolfCoursePage, renderGolfHolePage } from '../../src/utils/golf-ranking-image';

// The renderers pull in satori and resvg's native modules, which these tests have no use for - what is
// under test is which images get requested, with what data, and what happens when something fails.
jest.mock('../../src/utils/golf-result-image', () => ({ renderGolfResultImage: jest.fn() }));
jest.mock('../../src/utils/golf-ranking-image', () => ({ renderGolfHolePage: jest.fn(), renderGolfCoursePage: jest.fn() }));

// A real golf chart (Beta Pines hole 1) and one of the two accounts the golf images are gated to.
const GOLF_CHART = '88ea9f8af9490151';
const GOLF_TEST_USER = '3ac37479-c87f-459c-b3aa-c17e95c1a0d8';
// How many images golf's provider can emit. Update alongside the provider's maxImages.
const GOLF_SLOTS = 3;
const NOT_GOLF_CHART = 'ffffffffffffffff';
const ORDINARY_USER = '00000000-0000-0000-0000-000000000000';

const urls = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);

describe('MAX_RESULT_IMAGES', () => {
  it('is 4', () => {
    expect(MAX_RESULT_IMAGES).toBe(4);
  });
});

// A real, passing, unmodded submission: the baseline every slot test varies one thing about.
function slotSubmission(overrides: Partial<PlaySubmission> = {}): PlaySubmission {
  return { musicRate: 1, usedAutoplay: false, passed: true, _arrowCloudBodyVersion: '1.4', _engineName: 'ITGMania', ...overrides } as unknown as PlaySubmission;
}
const ALPHA_CHART = '7a520534f16d6455';
const NON_ALLOWLISTED_USER = '27cfc687-8d10-4132-bd29-da3b4ef54dfb';

describe('eventResultImageSlots', () => {
  it('reserves all three of golf’s slots for a ranked play on a visible course', () => {
    expect(eventResultImageSlots({ chartHash: GOLF_CHART, userId: GOLF_TEST_USER }, slotSubmission())).toBe(GOLF_SLOTS);
  });

  it('reserves nothing for a chart no event provider covers', () => {
    expect(eventResultImageSlots({ chartHash: NOT_GOLF_CHART, userId: GOLF_TEST_USER }, slotSubmission())).toBe(0);
  });

  // The provider is gated to test accounts while the beta rolls out. A user who gets no golf
  // images must not have pack-leaderboard room taken from them on its behalf.
  it('reserves nothing for a user the provider is gated away from', () => {
    expect(eventResultImageSlots({ chartHash: GOLF_CHART, userId: ORDINARY_USER }, slotSubmission())).toBe(0);
  });

  // Alpha Testing is the hidden course whose charts also sit in the Arrow Cloud Testing pack. Its boards
  // are never served, so golf can only ever produce its card there - reserving three would squeeze the
  // pack leaderboard for no reason.
  it('reserves a single slot on a hidden-course chart, since no boards will exist for it', () => {
    expect(eventResultImageSlots({ chartHash: ALPHA_CHART, userId: GOLF_TEST_USER }, slotSubmission())).toBe(1);
  });

  it.each([
    ['not passed', { passed: false }],
    ['rate-modded', { musicRate: 1.25 }],
    ['autoplay', { usedAutoplay: true }],
  ])('reserves a single slot for a play that is %s, since it will not be ranked', (_label, overrides) => {
    const slots = eventResultImageSlots({ chartHash: GOLF_CHART, userId: NON_ALLOWLISTED_USER }, slotSubmission(overrides as Partial<PlaySubmission>));
    expect(slots).toBe(1);
  });

  it('still reserves three for autoplay by an allow-listed user, whose autoplay counts', () => {
    expect(eventResultImageSlots({ chartHash: GOLF_CHART, userId: GOLF_TEST_USER }, slotSubmission({ usedAutoplay: true }))).toBe(3);
  });

  // The motivating case: golf and a pack leaderboard sharing one response. What each side is handed is
  // MAX_RESULT_IMAGES minus what golf reserved, so the arithmetic is what decides who gets the room.
  describe('what is left for the pack images', () => {
    const packBudget = (chartHash: string, submission: PlaySubmission) =>
      Math.max(0, MAX_RESULT_IMAGES - eventResultImageSlots({ chartHash, userId: GOLF_TEST_USER }, submission));

    it('gives packs the room golf can’t use on an Alpha chart: 4 - 1 = 3', () => {
      expect(packBudget(ALPHA_CHART, slotSubmission())).toBe(3);
    });

    it('leaves packs a single image when golf will produce all three: 4 - 3 = 1', () => {
      expect(packBudget(GOLF_CHART, slotSubmission())).toBe(1);
    });

    it('leaves packs the whole cap for a chart golf does not cover', () => {
      expect(packBudget(NOT_GOLF_CHART, slotSubmission())).toBe(MAX_RESULT_IMAGES);
    });
  });
});

describe('limitResultImages', () => {
  it('passes everything through when under the cap', () => {
    expect(limitResultImages(['g1'], ['p1'])).toEqual(['g1', 'p1']);
  });

  it('puts event images ahead of pack images', () => {
    expect(limitResultImages(['g1', 'g2'], ['p1', 'p2'])).toEqual(['g1', 'g2', 'p1', 'p2']);
  });

  it('truncates the pack images, not the golf ones, when both want more than fits', () => {
    const result = limitResultImages(urls('golf', 3), urls('pack', 4));
    expect(result).toHaveLength(MAX_RESULT_IMAGES);
    expect(result).toEqual(['golf-1', 'golf-2', 'golf-3', 'pack-1']);
  });

  it('keeps the pack images in their own order when truncating', () => {
    expect(limitResultImages(['g1'], ['summary', 'page-a', 'page-b', 'page-c'])).toEqual(['g1', 'summary', 'page-a', 'page-b']);
  });

  it('caps an overshooting event source too, as a backstop', () => {
    expect(limitResultImages(urls('golf', 6), urls('pack', 2))).toEqual(urls('golf', 4));
  });

  it('returns nothing for nothing', () => {
    expect(limitResultImages([], [])).toEqual([]);
  });
});

describe('computeEventResultImages (golf)', () => {
  const READ_API = 'https://golf-read.example.test';
  const realFetch = global.fetch;
  const fetchMock = jest.fn();

  const play = { id: 55, userId: GOLF_TEST_USER, chartHash: GOLF_CHART, createdAt: new Date('2026-10-10T12:00:00.000Z') } as Play;

  // Three tap notes, 20 ms / dead on / a miss: 16 + 0 + 200 = 216 raw strokes.
  function submission(overrides: Partial<PlaySubmission> = {}): PlaySubmission {
    return {
      hash: GOLF_CHART,
      songName: 'BIRDS OF A FEATHER (Alohaii Remix) (Hard)',
      artist: 'Billie Eilish',
      timingData: [
        [0, 0.02],
        [1, 0],
        [2, 'Miss'],
      ],
      radar: { Holds: [0, 0], Mines: [0, 0], Rolls: [0, 0] },
      musicRate: 1,
      usedAutoplay: false,
      passed: true,
      _arrowCloudBodyVersion: '1.4',
      _engineName: 'ITGMania',
      ...overrides,
    } as unknown as PlaySubmission;
  }

  const s3 = { send: jest.fn().mockResolvedValue({}) };
  const prismaWith = (rivals: string[] | Error) => ({
    userRival: {
      findMany: jest.fn(() => (rivals instanceof Error ? Promise.reject(rivals) : Promise.resolve(rivals.map((id) => ({ rivalUserId: id }))))),
    },
  });
  const run = (sub: PlaySubmission, prisma = prismaWith([]), forPlay: Play = play) =>
    computeEventResultImages({ submission: sub, play: forPlay, userAlias: 'Brandough', s3Client: s3 as never, prisma: prisma as never });

  // The other account golf is gated to. Unlike GOLF_TEST_USER it is NOT on the autoplay allow-list, so
  // it is the one to use when a test needs autoplay to count against a player.
  const NON_ALLOWLISTED_TEST_USER = '27cfc687-8d10-4132-bd29-da3b4ef54dfb';
  const playBy = (userId: string) => ({ ...play, userId }) as Play;

  const holeBoard = {
    courseSlug: 'beta-pines',
    courseName: 'Beta Pines',
    holeNumber: 1,
    songName: 'BIRDS OF A FEATHER (Alohaii Remix)',
    artist: 'Billie Eilish',
    par: 4,
    totalPlayers: 9,
    selfRank: 3,
    rows: [{ rank: 3, userId: GOLF_TEST_USER, alias: 'Brandough', totalStrokes: 216, isSelf: true, isRival: false, isPreviousBest: false }],
  };
  const courseBoard = {
    slug: 'beta-pines',
    name: 'Beta Pines',
    totalPlayers: 9,
    selfRank: 5,
    holesTotal: 18,
    selfHolesCompleted: 1,
    selfComplete: false,
    rows: [{ rank: 5, userId: GOLF_TEST_USER, alias: 'Brandough', totalStrokes: 216, holesCompleted: 1, isSelf: true, isRival: false, isPreviousBest: false }],
  };
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const notOk = (status: number) => ({ ok: false, status, json: async () => ({}) });
  const calledRoutes = () => fetchMock.mock.calls.map(([url]) => String(url).replace(READ_API, '').split('?')[0]);
  const queryOf = (callIndex: number) => new URL(String(fetchMock.mock.calls[callIndex][0])).searchParams;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOLF_READ_API_URL = `${READ_API}/`; // with the trailing slash the real Function URL has
    global.fetch = fetchMock as never;
    (renderGolfResultImage as jest.Mock).mockResolvedValue(Buffer.from('card'));
    (renderGolfHolePage as jest.Mock).mockResolvedValue(Buffer.from('hole'));
    (renderGolfCoursePage as jest.Mock).mockResolvedValue(Buffer.from('course'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.GOLF_READ_API_URL;
    jest.restoreAllMocks();
  });

  it('asks for the boards in a single call and returns the card, hole page and course page, in that order', async () => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: 400, hole: holeBoard, course: courseBoard }));
    const urls = await run(submission());

    expect(calledRoutes()).toEqual(['/rankings']);
    expect(urls.map((u) => u.split('/').pop())).toEqual(['golf-0.png', 'golf-1.png', 'golf-2.png']);
    expect(s3.send).toHaveBeenCalledTimes(3);
  });

  it('sends the play, its strokes and its time, and builds the URL without a double slash', async () => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: null, hole: holeBoard, course: courseBoard }));
    await run(submission());

    expect(String(fetchMock.mock.calls[0][0])).toMatch(new RegExp(`^${READ_API}/rankings\\?`));
    const q = queryOf(0);
    expect(q.get('userId')).toBe(GOLF_TEST_USER);
    expect(q.get('alias')).toBe('Brandough');
    expect(q.get('chartHash')).toBe(GOLF_CHART);
    expect(q.get('playId')).toBe('55');
    expect(q.get('strokes')).toBe('216');
    expect(q.get('playedAt')).toBe('2026-10-10T12:00:00.000Z');
  });

  it('passes the player’s rivals, and cuts the list to the read API’s ceiling rather than losing everything to a 400', async () => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: null, hole: holeBoard, course: courseBoard }));
    const rivals = Array.from({ length: 60 }, (_, i) => `rival-${i}`);
    await run(submission(), prismaWith(rivals));
    expect(queryOf(0).get('rivalIds')?.split(',')).toHaveLength(50);
  });

  it('omits rivalIds entirely for a player with none', async () => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: null, hole: holeBoard, course: courseBoard }));
    await run(submission(), prismaWith([]));
    expect(queryOf(0).has('rivalIds')).toBe(false);
  });

  it('carries on without rivals if the rival lookup fails', async () => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: null, hole: holeBoard, course: courseBoard }));
    const urls = await run(submission(), prismaWith(new Error('db down')));
    expect(queryOf(0).has('rivalIds')).toBe(false);
    expect(urls).toHaveLength(3);
  });

  // The card has always shown a play's strokes even when it didn't count. What it must not do is show
  // a rank the play didn't earn, so an ineligible play never asks for the boards.
  it.each([
    ['not passed', { passed: false }],
    ['rate-modded', { musicRate: 1.2 }],
    ['autoplay', { usedAutoplay: true }],
  ])('does not rank a play that is %s: card only, from /best, and no rival lookup', async (_label, overrides) => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: 400 }));
    const prisma = prismaWith(['r1']);
    const urls = await run(submission(overrides as Partial<PlaySubmission>), prisma, playBy(NON_ALLOWLISTED_TEST_USER));

    expect(calledRoutes()).toEqual(['/best']);
    expect(prisma.userRival.findMany).not.toHaveBeenCalled();
    expect(urls).toHaveLength(1);
    expect(renderGolfHolePage).not.toHaveBeenCalled();
    expect(renderGolfCoursePage).not.toHaveBeenCalled();
    expect((renderGolfResultImage as jest.Mock).mock.calls[0][0].previousBestStrokes).toBe(400);
  });

  it('still ranks autoplay for an allow-listed user, as eligibility does', async () => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: null, hole: holeBoard, course: courseBoard }));
    expect(await run(submission({ usedAutoplay: true }))).toHaveLength(3); // GOLF_TEST_USER is allow-listed
    expect(calledRoutes()).toEqual(['/rankings']);
  });

  // Deploy order. If this API ships before the golf backend, /rankings 404s; giving up there would also
  // throw away the previous-best delta the card has always shown.
  it('falls back to /best when /rankings does not exist yet, keeping the card’s delta', async () => {
    fetchMock.mockResolvedValueOnce(notOk(404)).mockResolvedValueOnce(ok({ previousBestStrokes: 400 }));
    const urls = await run(submission());

    expect(calledRoutes()).toEqual(['/rankings', '/best']);
    expect(urls).toHaveLength(1);
    expect((renderGolfResultImage as jest.Mock).mock.calls[0][0].previousBestStrokes).toBe(400);
  });

  it('does not retry on a real error from a route that exists', async () => {
    fetchMock.mockResolvedValueOnce(notOk(500));
    const urls = await run(submission());
    expect(calledRoutes()).toEqual(['/rankings']);
    expect(urls).toHaveLength(1); // the card, with no delta
    expect((renderGolfResultImage as jest.Mock).mock.calls[0][0].previousBestStrokes).toBeNull();
  });

  it('does not wait a second time after a timeout or network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('aborted'));
    const urls = await run(submission());
    expect(calledRoutes()).toEqual(['/rankings']);
    expect(urls).toHaveLength(1);
  });

  it('renders only the card when the read API is not configured, without calling it', async () => {
    delete process.env.GOLF_READ_API_URL;
    const urls = await run(submission());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(urls).toHaveLength(1);
  });

  it('renders only the card for a chart whose boards are hidden (null hole and course)', async () => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: 400, hole: null, course: null }));
    expect(await run(submission())).toHaveLength(1);
    expect(renderGolfHolePage).not.toHaveBeenCalled();
  });

  it('does not lose the other images when one page fails to render', async () => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: null, hole: holeBoard, course: courseBoard }));
    (renderGolfHolePage as jest.Mock).mockRejectedValueOnce(new Error('satori blew up'));
    const urls = await run(submission());
    expect(urls).toHaveLength(2); // card and course page
    expect(renderGolfCoursePage).toHaveBeenCalled();
  });

  it('still returns the ranking pages if the card itself fails', async () => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: null, hole: holeBoard, course: courseBoard }));
    (renderGolfResultImage as jest.Mock).mockRejectedValueOnce(new Error('card blew up'));
    expect(await run(submission())).toHaveLength(2);
  });

  // The three images are one set; a hole named or scored differently from one to the next would read
  // as a bug. The hole page takes its title, artist and par from the same sources as the card.
  it('titles and pars the hole page exactly as the card, not from the read API’s own copy', async () => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: null, hole: { ...holeBoard, songName: 'A DIFFERENT NAME', par: 99 }, course: courseBoard }));
    await run(submission());

    const card = (renderGolfResultImage as jest.Mock).mock.calls[0][0];
    const page = (renderGolfHolePage as jest.Mock).mock.calls[0][0];
    expect(page.songTitle).toBe(card.chartTitle);
    expect(page.songArtist).toBe(card.chartArtist);
    expect(page.par).toBe(card.par);
    expect(page.par).toBe(4); // Beta Pines hole 1, from GOLF_CHARTS
  });

  it('passes the boards’ rows through to the pages untouched', async () => {
    fetchMock.mockResolvedValueOnce(ok({ previousBestStrokes: null, hole: holeBoard, course: courseBoard }));
    await run(submission());
    expect((renderGolfHolePage as jest.Mock).mock.calls[0][0].rows).toEqual(holeBoard.rows);
    expect((renderGolfCoursePage as jest.Mock).mock.calls[0][0]).toMatchObject({
      courseName: 'Beta Pines',
      holesTotal: 18,
      totalPlayers: 9,
      rows: courseBoard.rows,
    });
  });
});
