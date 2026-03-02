import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { AuthenticatedEvent } from '../utils/types';
import { internalServerErrorResponse, respond } from '../utils/responses';
import { generateApiKey, hashApiKey } from '../utils/auth';

export const listApiKeys = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const rows = await prisma.apiKey.findMany({
      where: { userId: event.user.id },
      orderBy: { createdAt: 'asc' },
    });

    const apiKeys = rows.map((k: any) => ({
      id: k.keyHash,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt ?? null,
      fingerprint: k.keyHash.slice(0, 8),
    }));

    return respond(200, { apiKeys });
  } catch (err) {
    console.error('Error listing API keys', err);
    return internalServerErrorResponse();
  }
};

export const createApiKey = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const key = generateApiKey();
    const keyHash = hashApiKey(key);

    const created = await prisma.apiKey.create({
      data: {
        keyHash,
        userId: event.user.id,
      },
    });

    return respond(201, {
      apiKey: {
        id: created.keyHash,
        createdAt: created.createdAt,
        lastUsedAt: (created as any).lastUsedAt ?? null,
        fingerprint: created.keyHash.slice(0, 8),
      },
      key, // plaintext only returned upon creation
      message: 'API key created. Store it securely; it will not be shown again.',
    });
  } catch (err) {
    console.error('Error creating API key', err);
    return internalServerErrorResponse();
  }
};

export const deleteApiKey = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const keyId = event.routeParameters?.keyId;
    if (!keyId) {
      return respond(400, { error: 'API key ID is required' });
    }

    // Ensure the API key belongs to the user
    const key = await prisma.apiKey.findFirst({ where: { keyHash: keyId, userId: event.user.id } });
    if (!key) {
      return respond(404, { error: 'API key not found' });
    }

    await prisma.apiKey.delete({ where: { keyHash: keyId } });
    return respond(200, { message: 'API key deleted successfully' });
  } catch (err) {
    console.error('Error deleting API key', err);
    return internalServerErrorResponse();
  }
};
