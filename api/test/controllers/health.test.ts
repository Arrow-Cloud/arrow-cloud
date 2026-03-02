import { APIGatewayProxyEvent } from 'aws-lambda';
import { healthCheck, authCheck, postCheck } from '../../src/controllers/health';
import { AuthenticatedEvent } from '../../src/utils/types';
import { PrismaClient, User } from '../../prisma/generated/client';

// Mock Prisma
const mockPrisma = {
  user: {
    count: jest.fn(),
  },
} as unknown as PrismaClient;

describe('Health Controller', () => {
  let mockEvent: APIGatewayProxyEvent;
  let mockAuthenticatedEvent: AuthenticatedEvent;
  let mockUser: User;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock user object
    mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      emailVerifiedAt: null,
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
      passwordResetToken: null,
      passwordResetTokenExpiry: null,
      alias: 'testuser',
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

    // Basic event structure
    mockEvent = {
      path: '/',
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
    };

    // Authenticated event with user
    mockAuthenticatedEvent = {
      ...mockEvent,
      user: mockUser,
    };

    // Mock console.log for postCheck tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('healthCheck', () => {
    it('should return 200 OK response', async () => {
      const result = await healthCheck(mockEvent, mockPrisma);

      expect(result).toEqual(
        expect.objectContaining({
          statusCode: 200,
          body: JSON.stringify({
            message: 'OK',
          }),
        }),
      );
    });
  });

  describe('authCheck', () => {
    it('should return user greeting with user count', async () => {
      const userCount = 42;
      mockPrisma.user.count = jest.fn().mockResolvedValue(userCount);

      const result = await authCheck(mockAuthenticatedEvent, mockPrisma);

      expect(mockPrisma.user.count).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          statusCode: 200,
          body: JSON.stringify({
            message: `Hello ${mockUser.alias}! We currently have ${userCount} users.`,
          }),
        }),
      );
    });
  });

  describe('postCheck', () => {
    it('should return 204 response and log request', async () => {
      const testBody = JSON.stringify({ test: 'data', value: 123 });
      const eventWithBody = { ...mockAuthenticatedEvent, body: testBody };

      const result = await postCheck(eventWithBody, mockPrisma);

      expect(result).toEqual(
        expect.objectContaining({
          statusCode: 204,
          body: '',
        }),
      );

      expect(console.log).toHaveBeenCalledWith(`Received POST request from user ${mockUser.alias}:`, testBody);
    });
  });
});
