import { PrismaClient } from '../../prisma/generated/client';
import { z } from 'zod';

export const MAX_PREFERRED_LEADERBOARDS = 10; // safeguard; can adjust later

export const UpdatePreferredLeaderboardsSchema = z.object({
  leaderboardIds: z
    .array(z.number().int().positive())
  .min(0)
    .max(MAX_PREFERRED_LEADERBOARDS, `No more than ${MAX_PREFERRED_LEADERBOARDS} leaderboards allowed`),
});

export type UpdatePreferredLeaderboardsInput = z.infer<typeof UpdatePreferredLeaderboardsSchema>;

export async function getUserPreferredLeaderboardIds(prisma: PrismaClient, userId: string): Promise<number[]> {
  const rows = await prisma.userPreferredLeaderboard.findMany({
    where: { userId },
    select: { leaderboardId: true },
  });
  return rows.map((r) => r.leaderboardId);
}

export async function setUserPreferredLeaderboards(prisma: PrismaClient, userId: string, leaderboardIds: number[]) {
  // ensure all ids exist
  const uniqueIds = [...new Set(leaderboardIds)];
  const found = await prisma.leaderboard.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((l) => l.id));
  const missing = uniqueIds.filter((id) => !foundIds.has(id));
  if (missing.length) {
    throw new Error(`Unknown leaderboard ids: ${missing.join(',')}`);
  }

  await prisma.$transaction([
    prisma.userPreferredLeaderboard.deleteMany({ where: { userId } }),
    prisma.userPreferredLeaderboard.createMany({
      data: uniqueIds.map((id) => ({ userId, leaderboardId: id })),
      skipDuplicates: true,
    }),
  ]);

  return uniqueIds;
}
