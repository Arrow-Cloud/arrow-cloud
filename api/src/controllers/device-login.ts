import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { AuthenticatedEvent, ExtendedAPIGatewayProxyEvent, OptionalAuthEvent } from '../utils/types';
import { internalServerErrorResponse, respond } from '../utils/responses';
import { hashApiKey, generateApiKey } from '../utils/auth';
import { issueApiKeyForUser } from '../services/apiKeys';
import { z } from 'zod';

const DEVICE_LOGIN_STATUS = {
  pending: 'pending',
  approved: 'approved',
  consumed: 'consumed',
  cancelled: 'cancelled',
  expired: 'expired',
} as const;

const DEVICE_LOGIN_TTL_MS = 5 * 60 * 1000;
const DEVICE_LOGIN_POLL_INTERVAL_SECONDS = 3;
const SHORT_CODE_LENGTH = 8;
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const DeviceLoginStartSchema = z.object({
  machineLabel: z.string().trim().min(1).max(120).optional(),
  clientVersion: z.string().trim().min(1).max(50).optional(),
  themeVersion: z.string().trim().min(1).max(50).optional(),
});

const DeviceLoginPollSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  pollToken: z.string().min(1, 'Poll token is required'),
});

type DeviceLoginSessionRecord = Awaited<ReturnType<PrismaClient['deviceLoginSession']['findUnique']>>;

function parseJsonBody(event: ExtendedAPIGatewayProxyEvent): unknown {
  if (!event.body) {
    return {};
  }
  return JSON.parse(event.body);
}

function getFrontendUrl(): string {
  return process.env.FRONTEND_URL || 'https://arrowcloud.dance';
}

function getClientIp(event: ExtendedAPIGatewayProxyEvent): string | null {
  const forwardedFor = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'];
  if (!forwardedFor) {
    return null;
  }
  return forwardedFor.split(',')[0]?.trim() || null;
}

function generateShortCode(): string {
  let code = '';
  for (let index = 0; index < SHORT_CODE_LENGTH; index += 1) {
    const randomIndex = Math.floor(Math.random() * SHORT_CODE_ALPHABET.length);
    code += SHORT_CODE_ALPHABET[randomIndex];
  }
  return code;
}

async function generateUniqueShortCode(prisma: PrismaClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shortCode = generateShortCode();
    const existing = await prisma.deviceLoginSession.findUnique({
      where: { shortCode },
      select: { id: true },
    });
    if (!existing) {
      return shortCode;
    }
  }

  throw new Error('Failed to generate unique short code');
}

async function expireIfNeeded(prisma: PrismaClient, session: DeviceLoginSessionRecord): Promise<DeviceLoginSessionRecord> {
  if (!session) {
    return session;
  }

  const expired = session.expiresAt.getTime() <= Date.now();
  const canExpire = session.status === DEVICE_LOGIN_STATUS.pending || session.status === DEVICE_LOGIN_STATUS.approved;

  if (!expired || !canExpire) {
    return session;
  }

  return prisma.deviceLoginSession.update({
    where: { id: session.id },
    data: { status: DEVICE_LOGIN_STATUS.expired },
  });
}

function toSessionResponse(session: NonNullable<DeviceLoginSessionRecord>, currentUserId?: string) {
  return {
    sessionId: session.id,
    shortCode: session.shortCode,
    status: session.status,
    machineLabel: session.machineLabel,
    clientVersion: session.clientVersion,
    themeVersion: session.themeVersion,
    expiresAt: session.expiresAt.toISOString(),
    approvedAt: session.approvedAt?.toISOString() ?? null,
    consumedAt: session.consumedAt?.toISOString() ?? null,
    canApprove: !!currentUserId && session.status === DEVICE_LOGIN_STATUS.pending,
    approvedByCurrentUser: !!currentUserId && session.userId === currentUserId,
  };
}

export const startDeviceLogin = async (event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    let requestBody: unknown;
    try {
      requestBody = parseJsonBody(event);
    } catch (error) {
      console.error('Invalid JSON in device login start request:', error);
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    const validationResult = DeviceLoginStartSchema.safeParse(requestBody);
    if (!validationResult.success) {
      return respond(422, {
        error: 'Validation failed',
        issues: validationResult.error.issues,
      });
    }

    const pollToken = generateApiKey();
    const pollTokenHash = hashApiKey(pollToken);
    const shortCode = await generateUniqueShortCode(prisma);
    const expiresAt = new Date(Date.now() + DEVICE_LOGIN_TTL_MS);

    const session = await prisma.deviceLoginSession.create({
      data: {
        shortCode,
        pollTokenHash,
        status: DEVICE_LOGIN_STATUS.pending,
        machineLabel: validationResult.data.machineLabel,
        clientVersion: validationResult.data.clientVersion,
        themeVersion: validationResult.data.themeVersion,
        ipAddress: getClientIp(event),
        userAgent: event.headers['user-agent'] || event.headers['User-Agent'] || null,
        expiresAt,
      },
    });

    const verificationUrl = `${getFrontendUrl()}/device-login/${session.id}`;

    return respond(201, {
      sessionId: session.id,
      shortCode: session.shortCode,
      pollToken,
      pollIntervalSeconds: DEVICE_LOGIN_POLL_INTERVAL_SECONDS,
      expiresAt: session.expiresAt.toISOString(),
      verificationUrl,
    });
  } catch (error) {
    console.error('Error starting device login session:', error);
    return internalServerErrorResponse();
  }
};

export const getDeviceLoginSession = async (event: OptionalAuthEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const sessionId = event.routeParameters?.sessionId;
    if (!sessionId) {
      return respond(400, { error: 'Session ID is required' });
    }

    const found = await prisma.deviceLoginSession.findUnique({ where: { id: sessionId } });
    const session = await expireIfNeeded(prisma, found);

    if (!session) {
      return respond(404, { error: 'Device login session not found' });
    }

    return respond(200, toSessionResponse(session, event.user?.id));
  } catch (error) {
    console.error('Error getting device login session:', error);
    return internalServerErrorResponse();
  }
};

export const approveDeviceLogin = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const sessionId = event.routeParameters?.sessionId;
    if (!sessionId) {
      return respond(400, { error: 'Session ID is required' });
    }

    const found = await prisma.deviceLoginSession.findUnique({ where: { id: sessionId } });
    const session = await expireIfNeeded(prisma, found);

    if (!session) {
      return respond(404, { error: 'Device login session not found' });
    }

    if (session.status === DEVICE_LOGIN_STATUS.expired) {
      return respond(410, { error: 'Device login session has expired', status: DEVICE_LOGIN_STATUS.expired });
    }

    if (session.status === DEVICE_LOGIN_STATUS.consumed) {
      return respond(409, { error: 'Device login session has already been completed', status: DEVICE_LOGIN_STATUS.consumed });
    }

    if (session.status === DEVICE_LOGIN_STATUS.cancelled) {
      return respond(409, { error: 'Device login session has been cancelled', status: DEVICE_LOGIN_STATUS.cancelled });
    }

    if (session.status === DEVICE_LOGIN_STATUS.approved) {
      if (session.userId === event.user.id) {
        return respond(200, toSessionResponse(session, event.user.id));
      }
      return respond(409, { error: 'Device login session has already been approved by another user' });
    }

    const approved = await prisma.deviceLoginSession.update({
      where: { id: session.id },
      data: {
        status: DEVICE_LOGIN_STATUS.approved,
        approvedAt: new Date(),
        userId: event.user.id,
      },
    });

    return respond(200, toSessionResponse(approved, event.user.id));
  } catch (error) {
    console.error('Error approving device login session:', error);
    return internalServerErrorResponse();
  }
};

export const pollDeviceLogin = async (event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    let requestBody: unknown;
    try {
      requestBody = parseJsonBody(event);
    } catch (error) {
      console.error('Invalid JSON in device login poll request:', error);
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    const validationResult = DeviceLoginPollSchema.safeParse(requestBody);
    if (!validationResult.success) {
      return respond(422, {
        error: 'Validation failed',
        issues: validationResult.error.issues,
      });
    }

    const { sessionId, pollToken } = validationResult.data;
    const pollTokenHash = hashApiKey(pollToken);

    const found = await prisma.deviceLoginSession.findFirst({
      where: {
        id: sessionId,
        pollTokenHash,
      },
    });
    const session = await expireIfNeeded(prisma, found);

    if (!session) {
      return respond(404, { error: 'Device login session not found' });
    }

    if (session.status === DEVICE_LOGIN_STATUS.expired) {
      return respond(410, { status: DEVICE_LOGIN_STATUS.expired, error: 'Device login session has expired' });
    }

    if (session.status === DEVICE_LOGIN_STATUS.cancelled) {
      return respond(200, { status: DEVICE_LOGIN_STATUS.cancelled });
    }

    if (session.status === DEVICE_LOGIN_STATUS.pending) {
      return respond(200, {
        status: DEVICE_LOGIN_STATUS.pending,
        pollIntervalSeconds: DEVICE_LOGIN_POLL_INTERVAL_SECONDS,
      });
    }

    if (session.status === DEVICE_LOGIN_STATUS.consumed) {
      return respond(200, { status: DEVICE_LOGIN_STATUS.consumed });
    }

    if (session.status !== DEVICE_LOGIN_STATUS.approved || !session.userId) {
      return internalServerErrorResponse({ error: 'Device login session is in an invalid state' });
    }

    let issuedKey: string | null = null;
    const issuedAt = new Date();

    await prisma.$transaction(async (tx) => {
      const refreshed = await tx.deviceLoginSession.findFirst({
        where: {
          id: sessionId,
          pollTokenHash,
        },
      });

      if (!refreshed) {
        throw new Error('Device login session not found during issuance');
      }

      if (refreshed.expiresAt.getTime() <= Date.now()) {
        await tx.deviceLoginSession.update({
          where: { id: refreshed.id },
          data: { status: DEVICE_LOGIN_STATUS.expired },
        });
        throw new Error('Device login session expired during issuance');
      }

      if (refreshed.status !== DEVICE_LOGIN_STATUS.approved || !refreshed.userId) {
        throw new Error('Device login session already consumed');
      }

      const issued = await issueApiKeyForUser(tx, refreshed.userId);
      const updated = await tx.deviceLoginSession.updateMany({
        where: {
          id: refreshed.id,
          status: DEVICE_LOGIN_STATUS.approved,
        },
        data: {
          status: DEVICE_LOGIN_STATUS.consumed,
          consumedAt: issuedAt,
          issuedApiKeyHash: issued.keyHash,
        },
      });

      if (updated.count !== 1) {
        throw new Error('Device login session already consumed');
      }

      issuedKey = issued.key;
    });

    return respond(200, {
      status: DEVICE_LOGIN_STATUS.consumed,
      apiKey: issuedKey,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Device login session already consumed') {
      return respond(200, { status: DEVICE_LOGIN_STATUS.consumed });
    }
    if (error instanceof Error && error.message === 'Device login session expired during issuance') {
      return respond(410, { status: DEVICE_LOGIN_STATUS.expired, error: 'Device login session has expired' });
    }

    console.error('Error polling device login session:', error);
    return internalServerErrorResponse();
  }
};
