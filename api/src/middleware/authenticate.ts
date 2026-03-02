import { APIGatewayProxyEvent } from 'aws-lambda';
import { PrismaClient, User } from '../../prisma/generated/client';
import { hashApiKey, verifyJwtToken } from '../utils/auth';
import { AuthenticatedEvent, Middleware } from '../utils/types';
import { AuthenticationError } from '../utils/errors';

export const authenticate = async (event: APIGatewayProxyEvent, prisma: PrismaClient): Promise<User> => {
  // Try Bearer token authentication (JWT or API key)
  const authHeader = event.headers['Authorization'] || event.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('No valid authentication token provided');
  }

  const token = authHeader.slice(7);

  // First try JWT token authentication
  try {
    const payload = await verifyJwtToken(token);
    if (payload) {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });
      if (user) {
        // Check if user is banned
        if (user.banned) {
          throw new AuthenticationError('Account has been suspended');
        }
        return user;
      }
    }
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  } catch (error) {
    // JWT verification failed, continue to API key authentication
  }

  // Fall back to API key authentication
  const hashedToken = hashApiKey(token);

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hashedToken },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          alias: true,
          banned: true,
          shadowBanned: true,
          passwordHash: true,
          passwordSalt: true,
          profileImageUrl: true,
          timezone: true,
          emailVerifiedAt: true,
          emailVerificationToken: true,
          emailVerificationTokenExpiry: true,
          passwordResetToken: true,
          passwordResetTokenExpiry: true,
          stats: true,
          countryId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!apiKey) {
    throw new AuthenticationError('Invalid authentication token');
  }

  // Check if user is banned (reject outright for API key authentication)
  if (apiKey.user.banned) {
    throw new AuthenticationError('Account has been suspended');
  }

  // Update lastUsedAt asynchronously (do not block response)
  try {
    await (prisma as any).apiKey.update({ where: { keyHash: apiKey.keyHash }, data: { lastUsedAt: new Date() } });
  } catch (e) {
    // non-fatal
    console.warn('Failed to update API key lastUsedAt', e);
  }

  return apiKey.user;
};

export const authMiddleware: Middleware = async (event: APIGatewayProxyEvent, prisma: PrismaClient) => {
  try {
    const user = await authenticate(event, prisma);

    // Attach user to the event object
    (event as AuthenticatedEvent).user = user;

    // Return void to continue to the next middleware/handler
    return;
  } catch (error) {
    console.error('Authentication error:', error);

    if (error instanceof AuthenticationError) {
      return {
        statusCode: error.statusCode,
        body: JSON.stringify({
          error: 'Authentication failed',
          message: error.message,
        }),
      };
    }

    // For any other unexpected errors
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'An unexpected error occurred during authentication',
      }),
    };
  }
};

/**
 * Optional auth middleware - tries to authenticate but doesn't fail if no auth provided.
 * If auth is provided and valid, attaches user to event. If no auth or invalid, continues without user.
 */
export const optionalAuthMiddleware: Middleware = async (event: APIGatewayProxyEvent, prisma: PrismaClient) => {
  const authHeader = event.headers['Authorization'] || event.headers['authorization'];

  // If no auth header, continue without user
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return;
  }

  try {
    const user = await authenticate(event, prisma);
    // Attach user to the event object
    (event as AuthenticatedEvent).user = user;
  } catch (error) {
    // Auth failed, but this is optional auth so we continue without user
    console.log('Optional auth failed, continuing without user:', error instanceof Error ? error.message : error);
  }

  // Return void to continue to the next middleware/handler
  return;
};
