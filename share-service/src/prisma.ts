import { PrismaClient } from '../api/prisma/generated';
import { getDatabaseUrl } from './utils/secrets';

let prismaInstance: PrismaClient | null = null;

export async function getPrisma(): Promise<PrismaClient> {
  if (prismaInstance) {
    return prismaInstance;
  }

  const databaseUrl = await getDatabaseUrl();
  prismaInstance = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  return prismaInstance;
}

// For backward compatibility, export a proxy that throws if accessed before initialization
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    if (!prismaInstance) {
      throw new Error('Prisma client not initialized. Call getPrisma() first.');
    }
    return (prismaInstance as any)[prop];
  },
});
