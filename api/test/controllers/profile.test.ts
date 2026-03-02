import { updateProfile, getUserById } from '../../src/controllers/profile';
import { getUserPreferredLeaderboardIds } from '../../src/services/userPreferredLeaderboards';
import { getUserTrophies } from '../../src/services/trophies';
import { AuthenticatedEvent } from '../../src/utils/types';
import { PrismaClient, User } from '../../prisma/generated/client';
import { verifyPassword, hashPassword, generateSalt } from '../../src/utils/password';

// Mock the password utils
jest.mock('../../src/utils/password', () => ({
  verifyPassword: jest.fn(),
  hashPassword: jest.fn(),
  generateSalt: jest.fn(),
}));

// Mock the S3 utils
jest.mock('../../src/utils/s3', () => ({
  assetS3UrlToCloudFrontUrl: jest.fn((url) => (url ? url.replace('s3://', 'https://') : null)),
  toCfVariantSet: jest.fn((vs) => (vs ? vs : undefined)),
}));

const mockVerifyPassword = verifyPassword as jest.MockedFunction<typeof verifyPassword>;
const mockHashPassword = hashPassword as jest.MockedFunction<typeof hashPassword>;
const mockGenerateSalt = generateSalt as jest.MockedFunction<typeof generateSalt>;

jest.mock('../../src/services/userPreferredLeaderboards', () => ({
  getUserPreferredLeaderboardIds: jest.fn(),
}));

jest.mock('../../src/services/trophies', () => ({
  getUserTrophies: jest.fn(),
}));

const mockGetUserPreferredLeaderboardIds = getUserPreferredLeaderboardIds as jest.MockedFunction<typeof getUserPreferredLeaderboardIds>;
const mockGetUserTrophies = getUserTrophies as jest.MockedFunction<typeof getUserTrophies>;

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  play: {
    findMany: jest.fn(),
  },
  userPreferredLeaderboard: {
    findMany: jest.fn(),
  },
} as unknown as PrismaClient;

describe('Profile Controller', () => {
  let mockAuthenticatedEvent: AuthenticatedEvent;
  let mockUser: User;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserPreferredLeaderboardIds.mockResolvedValue([]); // default: no preferences
    mockGetUserTrophies.mockResolvedValue([]); // default: no trophies

    // Mock user object
    mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      alias: 'testuser',
      profileImageUrl: null,
      timezone: null,
      countryId: null,
      emailVerifiedAt: null,
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
      passwordResetToken: null,
      passwordResetTokenExpiry: null,
      banned: false,
      shadowBanned: false,
      passwordHash: 'hashedpassword',
      passwordSalt: 'salt123',
      createdAt: new Date(),
      updatedAt: new Date(),
      stats: null,
    };

    // Base authenticated event
    mockAuthenticatedEvent = {
      path: '/user',
      httpMethod: 'PUT',
      headers: {},
      multiValueHeaders: {},
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      body: JSON.stringify({
        alias: 'newuser',
      }),
      isBase64Encoded: false,
      user: mockUser,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('updateProfile', () => {
    it('should return 400 when body is missing', async () => {
      const eventWithoutBody = { ...mockAuthenticatedEvent, body: null };
      const result = await updateProfile(eventWithoutBody, mockPrisma);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Request body is required',
      });
    });

    it('should return 400 when body is invalid JSON', async () => {
      const eventWithInvalidJson = { ...mockAuthenticatedEvent, body: 'invalid json' };
      const result = await updateProfile(eventWithInvalidJson, mockPrisma);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Invalid JSON in request body',
      });
    });

    it('should return 422 when alias is too short', async () => {
      const eventWithShortAlias = {
        ...mockAuthenticatedEvent,
        body: JSON.stringify({ alias: 'ab' }),
      };
      const result = await updateProfile(eventWithShortAlias, mockPrisma);

      expect(result.statusCode).toBe(422);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Validation failed');
      expect(responseBody.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'Alias must be at least 3 characters long',
          }),
        ]),
      );
    });

    it('should return 422 when alias is too long', async () => {
      const longAlias = 'a'.repeat(51);
      const eventWithLongAlias = {
        ...mockAuthenticatedEvent,
        body: JSON.stringify({ alias: longAlias }),
      };
      const result = await updateProfile(eventWithLongAlias, mockPrisma);

      expect(result.statusCode).toBe(422);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Validation failed');
      expect(responseBody.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'Alias must be no more than 50 characters long',
          }),
        ]),
      );
    });

    it('should return 422 when alias contains spaces', async () => {
      const eventWithSpacedAlias = {
        ...mockAuthenticatedEvent,
        body: JSON.stringify({ alias: 'test user' }),
      };
      const result = await updateProfile(eventWithSpacedAlias, mockPrisma);

      expect(result.statusCode).toBe(422);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Validation failed');
      expect(responseBody.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'Alias must not contain spaces',
          }),
        ]),
      );
    });

    it('should return 422 when newPassword is provided without currentPassword', async () => {
      const eventWithoutCurrentPassword = {
        ...mockAuthenticatedEvent,
        body: JSON.stringify({ newPassword: 'newpassword123' }),
      };
      const result = await updateProfile(eventWithoutCurrentPassword, mockPrisma);

      expect(result.statusCode).toBe(422);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Validation failed');
      expect(responseBody.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'Current password is required when setting a new password',
          }),
        ]),
      );
    });

    it('should return 422 when newPassword is too short', async () => {
      const eventWithShortPassword = {
        ...mockAuthenticatedEvent,
        body: JSON.stringify({
          currentPassword: 'oldpassword',
          newPassword: '12345',
        }),
      };
      const result = await updateProfile(eventWithShortPassword, mockPrisma);

      expect(result.statusCode).toBe(422);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Validation failed');
      expect(responseBody.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'New password must be at least 6 characters long',
          }),
        ]),
      );
    });

    it('should return 404 when user is not found', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(null);

      const result = await updateProfile(mockAuthenticatedEvent, mockPrisma);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toEqual({
        error: 'User not found',
      });
    });

    it('should return 409 when alias already exists', async () => {
      const existingUser = { ...mockUser, id: 'other-user', alias: 'newuser' };
      mockPrisma.user.findUnique = jest
        .fn()
        .mockResolvedValueOnce(mockUser) // First call for current user
        .mockResolvedValueOnce(existingUser); // Second call for alias check

      const result = await updateProfile(mockAuthenticatedEvent, mockPrisma);

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Alias already exists',
      });
    });

    it('should return 400 when user has no current password set', async () => {
      const userWithoutPassword = {
        ...mockUser,
        passwordHash: null,
        passwordSalt: null,
      };
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(userWithoutPassword);

      const eventWithPasswordChange = {
        ...mockAuthenticatedEvent,
        body: JSON.stringify({
          currentPassword: 'oldpassword',
          newPassword: 'newpassword123',
        }),
      };

      const result = await updateProfile(eventWithPasswordChange, mockPrisma);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: 'No current password set',
      });
    });

    it('should return 401 when current password is incorrect', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      mockVerifyPassword.mockReturnValue(false);

      const eventWithPasswordChange = {
        ...mockAuthenticatedEvent,
        body: JSON.stringify({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123',
        }),
      };

      const result = await updateProfile(eventWithPasswordChange, mockPrisma);

      expect(mockVerifyPassword).toHaveBeenCalledWith('wrongpassword', 'salt123', 'hashedpassword');
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Current password is incorrect',
      });
    });

    it('should successfully update alias only', async () => {
      const fixedDate = new Date('2024-01-01T00:00:00.000Z');
      const updatedUser = {
        id: 'user-123',
        email: 'test@example.com',
        alias: 'newuser',
        profileImageUrl: null,
        emailVerifiedAt: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      };

      mockPrisma.user.findUnique = jest
        .fn()
        .mockResolvedValueOnce(mockUser) // Current user
        .mockResolvedValueOnce(null); // Alias check - not found

      mockPrisma.user.update = jest.fn().mockResolvedValue(updatedUser);

      const result = await updateProfile(mockAuthenticatedEvent, mockPrisma);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: { alias: 'newuser' },
        }),
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        user: {
          ...updatedUser,
          createdAt: fixedDate.toISOString(),
          updatedAt: fixedDate.toISOString(),
        },
        message: 'Profile updated successfully',
      });
    });

    it('should successfully update password only', async () => {
      const fixedDate = new Date('2024-01-01T00:00:00.000Z');
      const updatedUser = {
        id: 'user-123',
        email: 'test@example.com',
        alias: 'testuser',
        profileImageUrl: null,
        emailVerifiedAt: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      };

      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      mockVerifyPassword.mockReturnValue(true);
      mockGenerateSalt.mockReturnValue('newsalt123');
      mockHashPassword.mockReturnValue('newhashedpassword');
      mockPrisma.user.update = jest.fn().mockResolvedValue(updatedUser);

      const eventWithPasswordChange = {
        ...mockAuthenticatedEvent,
        body: JSON.stringify({
          currentPassword: 'oldpassword',
          newPassword: 'newpassword123',
        }),
      };

      const result = await updateProfile(eventWithPasswordChange, mockPrisma);

      expect(mockVerifyPassword).toHaveBeenCalledWith('oldpassword', 'salt123', 'hashedpassword');
      expect(mockGenerateSalt).toHaveBeenCalled();
      expect(mockHashPassword).toHaveBeenCalledWith('newpassword123', 'newsalt123');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: {
            passwordHash: 'newhashedpassword',
            passwordSalt: 'newsalt123',
          },
        }),
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        user: {
          ...updatedUser,
          createdAt: fixedDate.toISOString(),
          updatedAt: fixedDate.toISOString(),
        },
        message: 'Profile updated successfully',
      });
    });

    it('should successfully update both alias and password', async () => {
      const fixedDate = new Date('2024-01-01T00:00:00.000Z');
      const updatedUser = {
        id: 'user-123',
        email: 'test@example.com',
        alias: 'newuser',
        profileImageUrl: null,
        emailVerifiedAt: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      };

      mockPrisma.user.findUnique = jest
        .fn()
        .mockResolvedValueOnce(mockUser) // Current user
        .mockResolvedValueOnce(null); // Alias check - not found

      mockVerifyPassword.mockReturnValue(true);
      mockGenerateSalt.mockReturnValue('newsalt123');
      mockHashPassword.mockReturnValue('newhashedpassword');
      mockPrisma.user.update = jest.fn().mockResolvedValue(updatedUser);

      const eventWithBothChanges = {
        ...mockAuthenticatedEvent,
        body: JSON.stringify({
          alias: 'newuser',
          currentPassword: 'oldpassword',
          newPassword: 'newpassword123',
        }),
      };

      const result = await updateProfile(eventWithBothChanges, mockPrisma);

      expect(mockVerifyPassword).toHaveBeenCalledWith('oldpassword', 'salt123', 'hashedpassword');
      expect(mockGenerateSalt).toHaveBeenCalled();
      expect(mockHashPassword).toHaveBeenCalledWith('newpassword123', 'newsalt123');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: {
            alias: 'newuser',
            passwordHash: 'newhashedpassword',
            passwordSalt: 'newsalt123',
          },
        }),
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        user: {
          ...updatedUser,
          createdAt: fixedDate.toISOString(),
          updatedAt: fixedDate.toISOString(),
        },
        message: 'Profile updated successfully',
      });
    });

    it('should not update alias when it is the same as current', async () => {
      const fixedDate = new Date('2024-01-01T00:00:00.000Z');
      const updatedUser = {
        id: 'user-123',
        email: 'test@example.com',
        alias: 'testuser',
        profileImageUrl: null,
        emailVerifiedAt: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      };

      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      mockPrisma.user.update = jest.fn().mockResolvedValue(updatedUser);

      const eventWithSameAlias = {
        ...mockAuthenticatedEvent,
        body: JSON.stringify({ alias: 'testuser' }),
      };

      const result = await updateProfile(eventWithSameAlias, mockPrisma);

      // Should only call findUnique once for current user, not for alias check
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: { alias: 'testuser' },
        }),
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        user: {
          ...updatedUser,
          createdAt: fixedDate.toISOString(),
          updatedAt: fixedDate.toISOString(),
        },
        message: 'Profile updated successfully',
      });
    });

    it('should return 500 when there is a database error', async () => {
      mockPrisma.user.findUnique = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await updateProfile(mockAuthenticatedEvent, mockPrisma);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Internal server error',
      });
    });

    it('should handle empty request body successfully', async () => {
      const fixedDate = new Date('2024-01-01T00:00:00.000Z');
      const updatedUser = {
        id: 'user-123',
        email: 'test@example.com',
        alias: 'testuser',
        profileImageUrl: null,
        emailVerifiedAt: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      };

      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      mockPrisma.user.update = jest.fn().mockResolvedValue(updatedUser);

      const eventWithEmptyBody = {
        ...mockAuthenticatedEvent,
        body: JSON.stringify({}),
      };

      const result = await updateProfile(eventWithEmptyBody, mockPrisma);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: {},
        }),
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        user: {
          ...updatedUser,
          createdAt: fixedDate.toISOString(),
          updatedAt: fixedDate.toISOString(),
        },
        message: 'Profile updated successfully',
      });
    });
  });

  describe('getUserById', () => {
    let mockGetUserByIdEvent: AuthenticatedEvent;
    let mockRecentPlays: any[];

    beforeEach(() => {
      // Mock event for getUserById
      mockGetUserByIdEvent = {
        path: '/user/target-user-id',
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
        user: mockUser, // The authenticated user making the request
        routeParameters: {
          userId: 'target-user-id',
        },
      };

      // Mock recent plays data
      mockRecentPlays = [
        {
          createdAt: new Date('2024-01-01T10:00:00.000Z'),
          PlayLeaderboard: [
            {
              data: { score: '95.50', grade: 'A+' },
              leaderboard: { type: 'EX' },
            },
          ],
          chart: {
            hash: 'chart123hash',
            songName: 'Test Song',
            artist: 'Test Artist',
            stepsType: 'dance-single',
            difficulty: 'expert',
            meter: 15,
            simfiles: [
              {
                chartName: 'Test Chart',
                stepsType: 'dance-single',
                description: 'Expert',
                meter: 15,
                credit: 'Chart Artist',
                simfile: {
                  title: 'Test Song Title',
                  subtitle: 'Test Subtitle',
                  artist: 'Test Song Artist',
                  bannerUrl: 's3://bucket/banner.png',
                },
              },
            ],
          },
        },
        {
          createdAt: new Date('2024-01-01T09:00:00.000Z'),
          PlayLeaderboard: [
            {
              data: { score: '88.25', grade: 'B+' },
              leaderboard: { type: 'HardEX' },
            },
          ],
          chart: {
            hash: 'chart456hash',
            songName: 'Another Song',
            artist: 'Another Artist',
            stepsType: 'dance-double',
            difficulty: 'hard',
            meter: 12,
            simfiles: [],
          },
        },
      ];
    });

    it('should return 400 when userId is not provided', async () => {
      const eventWithoutUserId = {
        ...mockGetUserByIdEvent,
        routeParameters: {},
      };

      const result = await getUserById(eventWithoutUserId, mockPrisma);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: 'User ID is required',
      });
    });

    it('should return 404 when user is not found', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.play.findMany = jest.fn().mockResolvedValue([]);

      const result = await getUserById(mockGetUserByIdEvent, mockPrisma);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toEqual({
        error: 'User not found',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'target-user-id' },
        }),
      );
    });

    it('should return 404 when user is banned', async () => {
      const bannedUser = {
        id: 'target-user-id',
        alias: 'banneduser',
        profileImageUrl: null,
        banned: true,
        shadowBanned: false,
        countryId: null,
        country: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(bannedUser);
      mockPrisma.play.findMany = jest.fn().mockResolvedValue([]);

      const result = await getUserById(mockGetUserByIdEvent, mockPrisma);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toEqual({
        error: 'User not found',
      });
    });

    it('should return user with recent plays successfully', async () => {
      const fixedDate = new Date('2024-01-01T00:00:00.000Z');
      const mockTargetUser = {
        id: 'target-user-id',
        alias: 'targetuser',
        profileImageUrl: null,
        banned: false,
        shadowBanned: false,
        countryId: null,
        country: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      };

      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(mockTargetUser);
      mockPrisma.play.findMany = jest.fn().mockResolvedValue(mockRecentPlays);

      const result = await getUserById(mockGetUserByIdEvent, mockPrisma);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);

      expect(responseBody.user).toEqual({
        id: 'target-user-id',
        alias: 'targetuser',
        profileImageUrl: null,
        createdAt: fixedDate.toISOString(),
        updatedAt: fixedDate.toISOString(),
        banned: false,
        shadowBanned: false,
        blueShift: null,
        country: null,
        countryId: null,
        trophies: [],
        preferredLeaderboards: [],
        recentPlays: [
          {
            chart: {
              hash: 'chart123hash',
              bannerUrl: 'https://bucket/banner.png', // S3 URL transformed
              mdBannerUrl: null,
              smBannerUrl: null,
              title: 'Test Song Title', // From simfile
              artist: 'Test Song Artist', // From simfile
              stepsType: 'dance-single',
              difficulty: 'expert',
              meter: 15,
            },
            leaderboards: [
              {
                leaderboard: 'EX',
                data: { score: '95.50', grade: 'A+' },
              },
            ],
            createdAt: new Date('2024-01-01T10:00:00.000Z').toISOString(),
          },
          {
            chart: {
              hash: 'chart456hash',
              bannerUrl: null, // No simfile banner
              mdBannerUrl: null,
              smBannerUrl: null,
              title: 'Another Song', // Falls back to chart songName
              artist: 'Another Artist', // Falls back to chart artist
              stepsType: 'dance-double',
              difficulty: 'hard',
              meter: 12,
            },
            leaderboards: [
              {
                leaderboard: 'HardEX',
                data: { score: '88.25', grade: 'B+' },
              },
            ],
            createdAt: new Date('2024-01-01T09:00:00.000Z').toISOString(),
          },
        ],
      });

      expect(mockPrisma.play.findMany).toHaveBeenCalledWith({
        select: expect.objectContaining({
          createdAt: true,
          PlayLeaderboard: expect.objectContaining({
            select: expect.objectContaining({
              data: true,
              leaderboard: expect.objectContaining({
                select: expect.objectContaining({ type: true }),
              }),
            }),
          }),
          chart: expect.any(Object),
        }),
        where: { userId: 'target-user-id' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    });

    it('should return user with empty recent plays when user has no plays', async () => {
      const fixedDate = new Date('2024-01-01T00:00:00.000Z');
      const mockTargetUser = {
        id: 'target-user-id',
        alias: 'newuser',
        createdAt: fixedDate,
        updatedAt: fixedDate,
      };

      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(mockTargetUser);
      mockPrisma.play.findMany = jest.fn().mockResolvedValue([]);

      const result = await getUserById(mockGetUserByIdEvent, mockPrisma);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);

      expect(responseBody.user).toEqual({
        id: 'target-user-id',
        alias: 'newuser',
        profileImageUrl: null,
        createdAt: fixedDate.toISOString(),
        updatedAt: fixedDate.toISOString(),
        blueShift: null,
        trophies: [],
        preferredLeaderboards: [],
        recentPlays: [],
      });
    });

    it('should handle plays with multiple leaderboards', async () => {
      const fixedDate = new Date('2024-01-01T00:00:00.000Z');
      const mockTargetUser = {
        id: 'target-user-id',
        alias: 'targetuser',
        createdAt: fixedDate,
        updatedAt: fixedDate,
      };

      const playWithMultipleLeaderboards = [
        {
          createdAt: new Date('2024-01-01T10:00:00.000Z'),
          PlayLeaderboard: [
            {
              data: { score: '95.50', grade: 'A+' },
              leaderboard: { type: 'EX' },
            },
            {
              data: { score: '92.75', grade: 'A' },
              leaderboard: { type: 'HardEX' },
            },
          ],
          chart: {
            hash: 'chart789hash',
            songName: 'Multi Board Song',
            artist: 'Multi Artist',
            stepsType: 'dance-single',
            difficulty: 'challenge',
            meter: 18,
            simfiles: [],
          },
        },
      ];

      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(mockTargetUser);
      mockPrisma.play.findMany = jest.fn().mockResolvedValue(playWithMultipleLeaderboards);

      const result = await getUserById(mockGetUserByIdEvent, mockPrisma);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);

      expect(responseBody.user.recentPlays[0].leaderboards).toHaveLength(2);
      expect(responseBody.user.recentPlays[0].leaderboards).toEqual([
        {
          leaderboard: 'EX',
          data: { score: '95.50', grade: 'A+' },
        },
        {
          leaderboard: 'HardEX',
          data: { score: '92.75', grade: 'A' },
        },
      ]);
    });

    it('should return 500 when there is a database error', async () => {
      mockPrisma.user.findUnique = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await getUserById(mockGetUserByIdEvent, mockPrisma);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Internal server error',
      });
    });

    it('should return 500 when play fetch fails', async () => {
      const fixedDate = new Date('2024-01-01T00:00:00.000Z');
      const mockTargetUser = {
        id: 'target-user-id',
        alias: 'targetuser',
        createdAt: fixedDate,
        updatedAt: fixedDate,
      };

      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(mockTargetUser);
      mockPrisma.play.findMany = jest.fn().mockRejectedValue(new Error('Play fetch error'));

      const result = await getUserById(mockGetUserByIdEvent, mockPrisma);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Internal server error',
      });
    });

    it('should handle invalid UUID format gracefully', async () => {
      const eventWithInvalidUUID = {
        ...mockGetUserByIdEvent,
        routeParameters: {
          userId: 'invalid-uuid-format',
        },
      };

      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.play.findMany = jest.fn().mockResolvedValue([]);

      const result = await getUserById(eventWithInvalidUUID, mockPrisma);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toEqual({
        error: 'User not found',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'invalid-uuid-format' },
        }),
      );
    });
  });
});
