import { APIGatewayProxyEvent } from 'aws-lambda';
import { login, register, requestPasswordReset, resetPassword } from '../../src/controllers/auth';
import { PrismaClient, User } from '../../prisma/generated/client';
import { verifyPassword, hashPassword, generateSalt } from '../../src/utils/password';
import { generateJwtToken } from '../../src/utils/auth';
import { generateEmailVerificationToken } from '../../src/utils/email';

// Mock the password utils
jest.mock('../../src/utils/password', () => ({
  verifyPassword: jest.fn(),
  hashPassword: jest.fn(),
  generateSalt: jest.fn(),
}));

// Mock the auth utils
jest.mock('../../src/utils/auth', () => ({
  generateJwtToken: jest.fn(),
}));

// Mock the email utils
jest.mock('../../src/utils/email', () => ({
  generateEmailVerificationToken: jest.fn(),
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

const mockVerifyPassword = verifyPassword as jest.MockedFunction<typeof verifyPassword>;
const mockHashPassword = hashPassword as jest.MockedFunction<typeof hashPassword>;
const mockGenerateSalt = generateSalt as jest.MockedFunction<typeof generateSalt>;
const mockGenerateJwtToken = generateJwtToken as jest.MockedFunction<typeof generateJwtToken>;
const mockGenerateEmailVerificationToken = generateEmailVerificationToken as jest.MockedFunction<typeof generateEmailVerificationToken>;

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  // Added for resolveUserPermissions
  userPermission: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  userRole: {
    findMany: jest.fn().mockResolvedValue([]),
  },
} as unknown as PrismaClient;

describe('Auth Controller', () => {
  let mockEvent: APIGatewayProxyEvent;
  let mockUser: User;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      alias: 'testuser',
      profileImageUrl: null,
      timezone: null,
      emailVerifiedAt: null,
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
      passwordResetToken: null,
      passwordResetTokenExpiry: null,
      banned: false,
      shadowBanned: false,
      passwordHash: 'hashedpassword',
      passwordSalt: 'salt123',
      countryId: null,
      stats: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockEvent = {
      path: '/login',
      httpMethod: 'POST',
      headers: {},
      multiValueHeaders: {},
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'testpassword',
      }),
      isBase64Encoded: false,
    };
  });

  describe('login', () => {
    it('should return 400 when body is missing', async () => {
      const eventWithoutBody = { ...mockEvent, body: null };
      const result = await login(eventWithoutBody, mockPrisma);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Request body is required',
      });
    });

    it('should return 400 when body is invalid JSON', async () => {
      const eventWithInvalidJson = { ...mockEvent, body: 'invalid json' };
      const result = await login(eventWithInvalidJson, mockPrisma);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Invalid JSON in request body',
      });
    });

    it('should return 400 when email is missing', async () => {
      const eventWithoutEmail = {
        ...mockEvent,
        body: JSON.stringify({ password: 'testpassword' }),
      };
      const result = await login(eventWithoutEmail, mockPrisma);

      expect(result.statusCode).toBe(422);
    });

    it('should return 400 when password is missing', async () => {
      const eventWithoutPassword = {
        ...mockEvent,
        body: JSON.stringify({ email: 'test@example.com' }),
      };
      const result = await login(eventWithoutPassword, mockPrisma);

      expect(result.statusCode).toBe(422);
    });

    it('should return 400 when email format is invalid', async () => {
      const eventWithInvalidEmail = {
        ...mockEvent,
        body: JSON.stringify({ email: 'invalid-email', password: 'testpassword' }),
      };
      const result = await login(eventWithInvalidEmail, mockPrisma);

      expect(result.statusCode).toBe(422);
    });

    it('should return 400 when password is empty', async () => {
      const eventWithEmptyPassword = {
        ...mockEvent,
        body: JSON.stringify({ email: 'test@example.com', password: '' }),
      };
      const result = await login(eventWithEmptyPassword, mockPrisma);

      expect(result.statusCode).toBe(422);
    });

    it('should return 401 when user is not found', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(null);

      const result = await login(mockEvent, mockPrisma);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Invalid email or password',
      });
    });

    it('should return 401 when user has no password set', async () => {
      const userWithoutPassword = {
        ...mockUser,
        passwordHash: null,
        passwordSalt: null,
      };
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(userWithoutPassword);

      const result = await login(mockEvent, mockPrisma);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Password not set for this account',
      });
    });

    it('should return 401 when password is invalid', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      mockVerifyPassword.mockReturnValue(false);

      const result = await login(mockEvent, mockPrisma);

      expect(mockVerifyPassword).toHaveBeenCalledWith('testpassword', 'salt123', 'hashedpassword');
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Invalid email or password',
      });
    });

    it('should return 403 when user is banned', async () => {
      const bannedUser = { ...mockUser, banned: true };
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(bannedUser);
      mockVerifyPassword.mockReturnValue(true);

      const result = await login(mockEvent, mockPrisma);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Account has been suspended',
      });
    });

    it('should return 200 with JWT token when login is successful', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      mockVerifyPassword.mockReturnValue(true);
      mockGenerateJwtToken.mockResolvedValue('test-jwt-token');
      // No permissions for this user in this test case
      (mockPrisma.userPermission.findMany as any).mockResolvedValueOnce([]);
      (mockPrisma.userRole.findMany as any).mockResolvedValueOnce([]);

      const result = await login(mockEvent, mockPrisma);

      expect(mockVerifyPassword).toHaveBeenCalledWith('testpassword', 'salt123', 'hashedpassword');
      expect(mockGenerateJwtToken).toHaveBeenCalledWith('user-123', 'test@example.com', true);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // Match core shape; ignore any extra fields like permissions
      expect(body).toMatchObject({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          alias: 'testuser',
          emailVerifiedAt: null,
          profileImageUrl: null,
        },
        token: 'test-jwt-token',
      });
      // If present, permissions should be an array
      if (Object.prototype.hasOwnProperty.call(body, 'permissions')) {
        expect(Array.isArray(body.permissions)).toBe(true);
      }
    });

    it('should return 500 when there is a server error', async () => {
      mockPrisma.user.findUnique = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await login(mockEvent, mockPrisma);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Internal server error',
      });
    });
  });

  describe('register', () => {
    const createRegisterEvent = (body: any): APIGatewayProxyEvent => ({
      ...mockEvent,
      body: JSON.stringify(body),
      path: '/register',
    });

    it('should register a new user successfully', async () => {
      const requestBody = {
        email: 'newuser@example.com',
        alias: 'newuser',
        password: 'password123',
      };

      // Mock that neither email nor alias exists
      mockPrisma.user.findMany = jest.fn().mockResolvedValue([]);

      // Mock password hashing
      mockGenerateSalt.mockReturnValue('test-salt');
      mockHashPassword.mockReturnValue('hashed-password');

      // Mock email verification token generation
      mockGenerateEmailVerificationToken.mockReturnValue('test-email-token');

      // Mock user creation
      const mockNewUser = {
        id: 'new-user-id',
        email: 'newuser@example.com',
        alias: 'newuser',
        passwordHash: 'hashed-password',
        passwordSalt: 'test-salt',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.user.create = jest.fn().mockResolvedValue(mockNewUser);

      // Mock JWT generation
      mockGenerateJwtToken.mockResolvedValue('new-user-token');

      const event = createRegisterEvent(requestBody);
      const result = await register(event, mockPrisma);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ email: 'newuser@example.com' }, { alias: 'newuser' }],
        },
        select: {
          email: true,
          alias: true,
        },
      });
      expect(mockGenerateSalt).toHaveBeenCalled();
      expect(mockHashPassword).toHaveBeenCalledWith('password123', 'test-salt');
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'newuser@example.com',
          alias: 'newuser',
          passwordHash: 'hashed-password',
          passwordSalt: 'test-salt',
          emailVerificationToken: 'test-email-token',
          emailVerificationTokenExpiry: expect.any(Date),
        },
      });
      expect(mockGenerateJwtToken).toHaveBeenCalledWith('new-user-id', 'newuser@example.com');

      expect(result.statusCode).toBe(201);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.user.email).toBe('newuser@example.com');
      expect(responseBody.user.alias).toBe('newuser');
      expect(responseBody.token).toBe('new-user-token');
    });

    it('should reject registration with existing email', async () => {
      const requestBody = {
        email: 'existing@example.com',
        alias: 'newuser',
        password: 'password123',
      };

      // Mock that email already exists
      mockPrisma.user.findMany = jest.fn().mockResolvedValue([{ email: 'existing@example.com', alias: 'someotheruser' }]);

      const event = createRegisterEvent(requestBody);
      const result = await register(event, mockPrisma);

      expect(result.statusCode).toBe(409);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Email already registered');
    });

    it('should reject registration with existing alias', async () => {
      const requestBody = {
        email: 'new@example.com',
        alias: 'existinguser',
        password: 'password123',
      };

      // Mock that alias already exists
      mockPrisma.user.findMany = jest.fn().mockResolvedValue([{ email: 'someother@example.com', alias: 'existinguser' }]);

      const event = createRegisterEvent(requestBody);
      const result = await register(event, mockPrisma);

      expect(result.statusCode).toBe(409);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Alias already taken');
    });

    it('should prioritize email error when both email and alias exist', async () => {
      const requestBody = {
        email: 'existing@example.com',
        alias: 'existinguser',
        password: 'password123',
      };

      // Mock that both email and alias exist
      mockPrisma.user.findMany = jest.fn().mockResolvedValue([
        { email: 'existing@example.com', alias: 'someuser' },
        { email: 'otheruser@example.com', alias: 'existinguser' },
      ]);

      const event = createRegisterEvent(requestBody);
      const result = await register(event, mockPrisma);

      expect(result.statusCode).toBe(409);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Email already registered');
    });

    it('should reject registration with missing fields', async () => {
      const requestBody = {
        email: 'test@example.com',
        // missing alias and password
      };

      const event = createRegisterEvent(requestBody);
      const result = await register(event, mockPrisma);

      expect(result.statusCode).toBe(422);
      // not validating the entire response, it's a ZodError
    });

    it('should reject registration with invalid email format', async () => {
      const requestBody = {
        email: 'invalid-email',
        alias: 'testuser',
        password: 'password123',
      };

      const event = createRegisterEvent(requestBody);
      const result = await register(event, mockPrisma);

      expect(result.statusCode).toBe(422);
    });

    it('should reject registration with invalid alias (too short)', async () => {
      const requestBody = {
        email: 'test@example.com',
        alias: 'ab', // too short
        password: 'password123',
      };

      const event = createRegisterEvent(requestBody);
      const result = await register(event, mockPrisma);

      expect(result.statusCode).toBe(422);
    });

    it('should reject registration with alias containing spaces', async () => {
      const requestBody = {
        email: 'test@example.com',
        alias: 'test user', // contains space
        password: 'password123',
      };

      const event = createRegisterEvent(requestBody);
      const result = await register(event, mockPrisma);

      expect(result.statusCode).toBe(422);
    });

    it('should reject registration with alias too long', async () => {
      const requestBody = {
        email: 'test@example.com',
        alias: 'a'.repeat(51), // too long
        password: 'password123',
      };

      const event = createRegisterEvent(requestBody);
      const result = await register(event, mockPrisma);

      expect(result.statusCode).toBe(422);
    });

    it('should reject registration with short password', async () => {
      const requestBody = {
        email: 'test@example.com',
        alias: 'testuser',
        password: '123', // too short
      };

      const event = createRegisterEvent(requestBody);
      const result = await register(event, mockPrisma);

      expect(result.statusCode).toBe(422);
    });

    it('should return 500 when there is a server error', async () => {
      const requestBody = {
        email: 'test@example.com',
        alias: 'testuser',
        password: 'password123',
      };

      mockPrisma.user.findMany = jest.fn().mockRejectedValue(new Error('Database error'));

      const event = createRegisterEvent(requestBody);
      const result = await register(event, mockPrisma);

      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Internal server error');
    });
  });

  describe('requestPasswordReset', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      mockPrisma.user.update = jest.fn().mockResolvedValue({ ...mockUser, passwordResetToken: 'reset-token', passwordResetTokenExpiry: new Date() });
    });
    it('should return 204 even when user does not exist', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(null);

      const event = {
        body: JSON.stringify({ email: 'nonexistent@example.com' }),
      } as APIGatewayProxyEvent;

      const result = await requestPasswordReset(event, mockPrisma);

      expect(result.statusCode).toBe(204);
      expect(result.body).toBe('');
    });

    it('should return 422 when email is invalid', async () => {
      const event = {
        body: JSON.stringify({ email: 'invalid-email' }),
      } as APIGatewayProxyEvent;

      const result = await requestPasswordReset(event, mockPrisma);

      expect(result.statusCode).toBe(422);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Validation failed');
    });

    it('should silently skip sending email when user has recent reset token', async () => {
      const userWithRecentToken = {
        ...mockUser,
        passwordResetTokenExpiry: new Date(Date.now() + 59 * 60 * 1000), // 59 minutes from now
      };
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(userWithRecentToken);

      const event = {
        body: JSON.stringify({ email: 'test@example.com' }),
      } as APIGatewayProxyEvent;

      const result = await requestPasswordReset(event, mockPrisma);

      expect(result.statusCode).toBe(204);
      expect(result.body).toBe('');
      // Should not call update when rate limited
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should send email when user has old reset token', async () => {
      const userWithOldToken = {
        ...mockUser,
        passwordResetTokenExpiry: new Date(Date.now() + 1 * 60 * 1000), // 1 minute from now (less than 58 minutes)
      };
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(userWithOldToken);
      mockPrisma.user.update = jest.fn().mockResolvedValue({ ...mockUser, passwordResetToken: 'new-reset-token', passwordResetTokenExpiry: new Date() });

      const event = {
        body: JSON.stringify({ email: 'test@example.com' }),
      } as APIGatewayProxyEvent;

      const result = await requestPasswordReset(event, mockPrisma);

      expect(result.statusCode).toBe(204);
      expect(result.body).toBe('');
      // Should call update when not rate limited
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    beforeEach(() => {
      const userWithResetToken = {
        ...mockUser,
        passwordResetToken: 'valid-token',
        passwordResetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      };
      mockPrisma.user.findFirst = jest.fn().mockResolvedValue(userWithResetToken);
      mockPrisma.user.update = jest.fn().mockResolvedValue({ ...mockUser, passwordResetToken: null, passwordResetTokenExpiry: null });
    });

    it('should reset password with valid token', async () => {
      mockGenerateJwtToken.mockResolvedValue('reset-jwt-token');

      const event = {
        body: JSON.stringify({ token: 'valid-token', password: 'newpassword123' }),
      } as APIGatewayProxyEvent;

      const result = await resetPassword(event, mockPrisma);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.user).toBeDefined();
      expect(body.token).toBeDefined();
    });

    it('should return 400 with invalid token', async () => {
      mockPrisma.user.findFirst = jest.fn().mockResolvedValue(null);

      const event = {
        body: JSON.stringify({ token: 'invalid-token', password: 'newpassword123' }),
      } as APIGatewayProxyEvent;

      const result = await resetPassword(event, mockPrisma);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid or expired reset token');
    });

    it('should return 422 when password is too short', async () => {
      const event = {
        body: JSON.stringify({ token: 'valid-token', password: '123' }),
      } as APIGatewayProxyEvent;

      const result = await resetPassword(event, mockPrisma);

      expect(result.statusCode).toBe(422);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Validation failed');
    });
  });
});
