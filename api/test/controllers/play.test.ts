import { getPlay, deletePlay } from '../../src/controllers/play';
import { ExtendedAPIGatewayProxyEvent, AuthenticatedEvent } from '../../src/utils/types';
import { PrismaClient, User } from '../../prisma/generated/client';

// Mock s3 utilities used by the controller
const cfDomain = 'https://d31dik069m7bb1.cloudfront.net';
jest.mock('../../src/utils/s3', () => ({
  assetS3UrlToCloudFrontUrl: jest.fn((url: string | null) => (url ? url.replace('s3://arrow-cloud-assets', 'https://d31dik069m7bb1.cloudfront.net') : null)),
  toCfVariantSet: jest.fn((vs) => (vs ? vs : undefined)),
  loadTimingDataFromPlay: jest.fn(),
}));

// Mock the events utility
jest.mock('../../src/utils/events', () => ({
  publishScoreDeletedEvent: jest.fn().mockResolvedValue(undefined),
  EVENT_TYPES: {
    SCORE_SUBMITTED: 'score-submitted',
    SCORE_DELETED: 'score-deleted',
  },
}));

import { loadTimingDataFromPlay } from '../../src/utils/s3';

// Minimal Prisma mock type
type MockPrisma = Pick<PrismaClient, 'play'>;

const createEvent = (playId?: string): ExtendedAPIGatewayProxyEvent => ({
  body: null,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'GET',
  isBase64Encoded: false,
  path: `/play/${playId ?? ''}`,
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {} as any,
  resource: '',
  routeParameters: playId ? { playId } : undefined,
});

describe('Play Controller - getPlay', () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      play: {
        findUnique: jest.fn(),
      },
    } as any;
  });

  it('returns 200 with play details, judgments ordered, and timing data when found', async () => {
    const playId = 123;
    const createdAt = new Date('2025-01-01T00:00:00Z');

    (prisma.play.findUnique as jest.Mock).mockResolvedValue({
      id: playId,
      createdAt,
      rawTimingDataUrl: 's3://arrow-cloud-scores/scores/hash/user/ts.json',
      user: { id: 'user-1', alias: 'Tester' },
      chart: {
        hash: 'chart-hash',
        stepsType: 'dance-single',
        difficulty: 'Expert',
        meter: 12,
        songName: 'Song From Chart',
        artist: 'Artist From Chart',
        simfiles: [
          {
            simfile: {
              title: 'Simfile Title',
              artist: 'Simfile Artist',
              bannerUrl: 's3://arrow-cloud-assets/banners/some.jpg',
              mdBannerUrl: null,
              smBannerUrl: null,
              bannerVariants: null,
            },
          },
        ],
      },
      PlayLeaderboard: [
        {
          leaderboard: { type: 'default' },
          data: {
            judgments: {
              Great: 2,
              Miss: 1,
              'Fantastic (23ms)': 5,
              Excellent: 3,
              'Fantastic (15ms)': 4,
              Decent: 0,
              'Way Off': 0,
            },
          },
        },
      ],
    });

    (loadTimingDataFromPlay as jest.Mock).mockResolvedValue({
      timingData: [
        [0.5, 0.01, 1, true, false, true, 0.01, false],
        [1.0, 'Miss', 2, false, false, false, 0, false],
      ],
      lifebarInfo: [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.7 },
      ],
    });

    const res = await getPlay(createEvent(String(playId)), prisma as any);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(playId);
    expect(body.createdAt).toBe(createdAt.toISOString());

    // Chart and banner URLs
    expect(body.chart).toEqual(
      expect.objectContaining({
        hash: 'chart-hash',
        title: 'Simfile Title',
        artist: 'Simfile Artist',
        stepsType: 'dance-single',
        difficulty: 'Expert',
        meter: 12,
        bannerUrl: `${cfDomain}/banners/some.jpg`,
        mdBannerUrl: null,
        smBannerUrl: null,
      }),
    );

    // Judgments ordered according to EX system
    const ordered = body.leaderboards[0].data.judgmentsOrdered;
    expect(ordered.map((j: any) => j.name)).toEqual(['Fantastic (15ms)', 'Fantastic (23ms)', 'Excellent', 'Great', 'Decent', 'Way Off', 'Miss']);
    expect(ordered).toEqual([
      { name: 'Fantastic (15ms)', value: 4 },
      { name: 'Fantastic (23ms)', value: 5 },
      { name: 'Excellent', value: 3 },
      { name: 'Great', value: 2 },
      { name: 'Decent', value: 0 },
      { name: 'Way Off', value: 0 },
      { name: 'Miss', value: 1 },
    ]);

    // Timing data mapped to [time, offset]
    expect(body.timingData).toEqual([
      [0.5, 0.01],
      [1, 'Miss'],
    ]);
    expect(body.lifebarInfo).toEqual([
      { x: 0, y: 0.5 },
      { x: 1, y: 0.7 },
    ]);
  });

  it('returns 400 when playId missing', async () => {
    const res = await getPlay(createEvent(undefined), prisma as any);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'playId is required' });
  });

  it('returns 400 when playId invalid', async () => {
    const res = await getPlay(createEvent('abc'), prisma as any);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid playId' });
  });

  it('returns 404 when play not found', async () => {
    (prisma.play.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await getPlay(createEvent('999'), prisma as any);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Play not found' });
  });

  it('gracefully handles timing data load failure (timingData and lifebarInfo null)', async () => {
    (prisma.play.findUnique as jest.Mock).mockResolvedValue({
      id: 5,
      createdAt: new Date('2025-01-02T00:00:00Z'),
      rawTimingDataUrl: 's3://arrow-cloud-scores/scores/hash/user/ts.json',
      user: { id: 'user-1', alias: 'Tester' },
      chart: {
        hash: 'hash',
        stepsType: 'dance-single',
        difficulty: 'Hard',
        meter: 10,
        songName: 'Song',
        artist: 'Artist',
        simfiles: [
          {
            simfile: {
              title: 'Song',
              artist: 'Artist',
              bannerUrl: 's3://arrow-cloud-assets/banners/some.jpg',
              mdBannerUrl: null,
              smBannerUrl: null,
              bannerVariants: null,
            },
          },
        ],
      },
      PlayLeaderboard: [],
    });

    (loadTimingDataFromPlay as jest.Mock).mockRejectedValue(new Error('S3 error'));

    const res = await getPlay(createEvent('5'), prisma as any);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.timingData).toBeNull();
    expect(body.lifebarInfo).toBeNull();
  });

  it('returns 500 on unexpected errors', async () => {
    (prisma.play.findUnique as jest.Mock).mockRejectedValue(new Error('DB down'));
    const res = await getPlay(createEvent('1'), prisma as any);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'Internal server error' });
  });
});

describe('Play Controller - deletePlay', () => {
  let prisma: MockPrisma & {
    play: { delete: jest.Mock; findUnique: jest.Mock };
    playLeaderboard: { deleteMany: jest.Mock };
    lifebar: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  const mockUser: User = {
    id: 'user-123',
    alias: 'TestUser',
    email: 'test@example.com',
    emailVerifiedAt: new Date(),
    emailVerificationToken: null,
    emailVerificationTokenExpiry: null,
    passwordHash: null,
    passwordSalt: null,
    passwordResetToken: null,
    passwordResetTokenExpiry: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    profileImageUrl: null,
    timezone: null,
    countryId: 1,
    banned: false,
    stats: null,
    shadowBanned: false,
  };

  const createDeleteEvent = (playId?: string, user: User = mockUser): AuthenticatedEvent => ({
    ...createEvent(playId),
    user,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock transaction to execute the callback immediately
    const mockTx = {
      playLeaderboard: { deleteMany: jest.fn() },
      lifebar: { deleteMany: jest.fn() },
      play: { delete: jest.fn() },
    };

    prisma = {
      play: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      playLeaderboard: {
        deleteMany: jest.fn(),
      },
      lifebar: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => {
        return await callback(mockTx);
      }),
    } as any;
  });

  it("successfully deletes user's own play", async () => {
    const playId = 456;
    (prisma.play.findUnique as jest.Mock).mockResolvedValue({
      id: playId,
      userId: mockUser.id,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      chartHash: 'chart-hash',
      chart: {
        hash: 'chart-hash',
        songName: 'Test Song',
        difficulty: 'Expert',
        meter: 12,
      },
      PlayLeaderboard: [],
    });

    const res = await deletePlay(createDeleteEvent(String(playId)), prisma as any);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      message: 'Play deleted successfully',
      deletedPlayId: playId,
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('returns 400 when playId is missing', async () => {
    const res = await deletePlay(createDeleteEvent(undefined), prisma as any);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'playId is required' });
    expect(prisma.play.findUnique).not.toHaveBeenCalled();
    expect(prisma.play.delete).not.toHaveBeenCalled();
  });

  it('returns 400 when playId is invalid', async () => {
    const res = await deletePlay(createDeleteEvent('invalid'), prisma as any);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid playId' });
    expect(prisma.play.findUnique).not.toHaveBeenCalled();
    expect(prisma.play.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when play not found', async () => {
    // this also covers trying to delete another user's play
    // since we conditionally query where the play id and event's user id match
    (prisma.play.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await deletePlay(createDeleteEvent('999'), prisma as any);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Play not found' });
    expect(prisma.play.delete).not.toHaveBeenCalled();
  });

  it('returns 500 on unexpected errors', async () => {
    (prisma.play.findUnique as jest.Mock).mockRejectedValue(new Error('DB down'));

    const res = await deletePlay(createDeleteEvent('1'), prisma as any);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'Internal server error' });
  });
});
