import { updateUserPreferredLeaderboards } from '../../src/controllers/profile';
import { AuthenticatedEvent } from '../../src/utils/types';
import { PrismaClient, User } from '../../prisma/generated/client';

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  userPreferredLeaderboard: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  leaderboard: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
} as unknown as PrismaClient;

const baseUser: User = {
  id: 'user-1',
  email: 'user@example.com',
  alias: 'useralias',
  profileImageUrl: null,
  timezone: null,
  emailVerifiedAt: null,
  emailVerificationToken: null,
  emailVerificationTokenExpiry: null,
  passwordResetToken: null,
  passwordResetTokenExpiry: null,
  passwordHash: 'hash',
  passwordSalt: 'salt',
  countryId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  banned: false,
  shadowBanned: false,
  stats: null,
};

describe('updateUserPreferredLeaderboards', () => {
  let event: AuthenticatedEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    event = {
      path: '/user/leaderboards',
      httpMethod: 'PUT',
      headers: {},
      multiValueHeaders: {},
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      body: JSON.stringify({ leaderboardIds: [2, 4] }),
      isBase64Encoded: false,
      user: baseUser,
    };

    mockPrisma.leaderboard.findMany = jest.fn().mockResolvedValue([
      { id: 2, type: 'EX' },
      { id: 4, type: 'HardEX' },
    ]);
    mockPrisma.user.findUnique = jest.fn().mockResolvedValue(baseUser);
    (mockPrisma.userPreferredLeaderboard.deleteMany as any).mockResolvedValue({});
    (mockPrisma.userPreferredLeaderboard.createMany as any).mockResolvedValue({});
  });

  it('returns 400 when body missing', async () => {
    const result = await updateUserPreferredLeaderboards({ ...event, body: null }, mockPrisma);
    expect(result.statusCode).toBe(400);
  });

  it('returns 422 on validation failure', async () => {
    const bad = await updateUserPreferredLeaderboards({ ...event, body: JSON.stringify({ leaderboardIds: ['bad'] }) }, mockPrisma);
    expect(bad.statusCode).toBe(422);
  });

  it('accepts empty array (clear)', async () => {
    const cleared = await updateUserPreferredLeaderboards({ ...event, body: JSON.stringify({ leaderboardIds: [] }) }, mockPrisma);
    expect(cleared.statusCode).toBe(200);
    const body = JSON.parse(cleared.body);
    expect(body.user.preferredLeaderboards).toEqual([]);
  });

  it('persists valid list and returns user object with preferredLeaderboards', async () => {
    const result = await updateUserPreferredLeaderboards(event, mockPrisma);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.user.preferredLeaderboards).toEqual([2, 4]);
    expect(mockPrisma.leaderboard.findMany).toHaveBeenCalledWith({
      where: { id: { in: [2, 4] } },
      select: { id: true },
    });
  });

  it('fails when unknown ids present', async () => {
    mockPrisma.leaderboard.findMany = jest.fn().mockResolvedValue([{ id: 2, type: 'EX' }]);
    const res = await updateUserPreferredLeaderboards(event, mockPrisma);
    expect(res.statusCode).toBe(500); // service throws -> internal error
  });
});
