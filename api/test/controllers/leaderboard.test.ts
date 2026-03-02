import { getLeaderboardsForChart } from '../../src/controllers/leaderboard';
import { getUserPreferredLeaderboardIds } from '../../src/services/userPreferredLeaderboards';
import { AuthenticatedEvent } from '../../src/utils/types';
import { PrismaClient, User } from '../../prisma/generated/client';

jest.mock('../../src/services/userPreferredLeaderboards', () => ({
  getUserPreferredLeaderboardIds: jest.fn(),
}));

const mockGetUserPreferredLeaderboardIds = getUserPreferredLeaderboardIds as jest.MockedFunction<typeof getUserPreferredLeaderboardIds>;

// Prisma mock implementing only what controller uses for curated endpoint
const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
  leaderboard: { findMany: jest.fn() },
  userRival: { findMany: jest.fn().mockResolvedValue([]) },
} as unknown as PrismaClient;

describe('getLeaderboardsForChart (curated authenticated)', () => {
  let event: AuthenticatedEvent;
  let user: User;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserPreferredLeaderboardIds.mockResolvedValue([]);
    user = {
      id: 'user-123',
      email: 'x@example.com',
      alias: 'testuser',
      emailVerifiedAt: null,
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
      passwordResetToken: null,
      passwordResetTokenExpiry: null,
      profileImageUrl: null,
      timezone: null,
      countryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      passwordHash: null,
      passwordSalt: null,
      banned: false,
      shadowBanned: false,
      stats: null,
    };
    event = {
      path: '/leaderboards/hash',
      httpMethod: 'GET',
      headers: {},
      multiValueHeaders: {},
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      body: null,
      isBase64Encoded: false,
      user,
      routeParameters: { chartHash: 'chart-hash' },
    };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('400 when chartHash missing', async () => {
    const result = await getLeaderboardsForChart({ ...event, routeParameters: undefined } as any, mockPrisma);
    expect(result.statusCode).toBe(400);
  });

  it('returns curated default leaderboards (>=7 entries, self flagged)', async () => {
    (mockPrisma.$queryRawUnsafe as any).mockImplementation((_sql: string, chartHash: string, leaderboardId: number) => {
      const type = `LB-${leaderboardId}`;
      const rows: any[] = [];
      for (let r = 1; r <= 10; r++) {
        rows.push({
          total_users: BigInt(40),
          user_rank: BigInt(5),
          rank: BigInt(r),
          data: { score: (100 - r).toFixed(2), grade: 'A' },
          userAlias: r === 5 ? 'testuser' : `${type}-alias-${r}`,
          userId: r === 5 ? 'user-123' : `${type}-user-${r}`,
          leaderboardType: type,
          date: new Date('2025-01-01T00:00:00Z'),
          playId: BigInt(900 + r),
        });
      }
      return rows;
    });
    const result = await getLeaderboardsForChart(event, mockPrisma);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.leaderboards).toHaveLength(3);
    body.leaderboards.forEach((lb: any) => {
      expect(lb.scores.length).toBeGreaterThanOrEqual(7);
      expect(lb.scores.filter((s: any) => s.isSelf).length).toBe(1);
      const ranks = lb.scores.map((s: any) => parseInt(s.rank, 10));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });
    expect((mockPrisma.$queryRawUnsafe as any).mock.calls.length).toBe(3);
  });

  it('filters to preferred leaderboard ids', async () => {
    mockGetUserPreferredLeaderboardIds.mockResolvedValue([2, 4]);
    (mockPrisma.leaderboard.findMany as any).mockResolvedValue([{ id: 2 }, { id: 4 }]);
    (mockPrisma.$queryRawUnsafe as any).mockImplementation((_sql: string, chartHash: string, leaderboardId: number) => {
      const type = leaderboardId === 2 ? 'EX' : leaderboardId === 4 ? 'HardEX' : `LB-${leaderboardId}`;
      return [
        {
          total_users: BigInt(10),
          user_rank: BigInt(1),
          rank: BigInt(1),
          data: { score: '100.00', grade: 'AAA' },
          userAlias: 'testuser',
          userId: 'user-123',
          leaderboardType: type,
          date: new Date(),
          playId: BigInt(1),
        },
      ];
    });
    const result = await getLeaderboardsForChart(event, mockPrisma);
    const body = JSON.parse(result.body);
    expect(body.leaderboards).toHaveLength(2);
    const ids = body.leaderboards.map((l: any) => l.id).sort();
    expect(ids).toEqual([2, 4]);
    expect((mockPrisma.$queryRawUnsafe as any).mock.calls.length).toBe(2);
  });
});
