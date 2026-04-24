import { Prisma, PrismaClient } from '../../prisma/generated/client';
import { generateApiKey, hashApiKey } from '../utils/auth';

export interface IssuedApiKey {
  key: string;
  keyHash: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export async function issueApiKeyForUser(prisma: PrismaClient | Prisma.TransactionClient, userId: string): Promise<IssuedApiKey> {
  const key = generateApiKey();
  const keyHash = hashApiKey(key);

  const created = await prisma.apiKey.create({
    data: {
      keyHash,
      userId,
    },
  });

  return {
    key,
    keyHash,
    createdAt: created.createdAt,
    lastUsedAt: (created as any).lastUsedAt ?? null,
  };
}
