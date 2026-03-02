import { PrismaClient, Prisma } from '../../prisma/generated/client';
import { assetS3UrlToCloudFrontUrl } from '../utils/s3';

export interface TrophyResponse {
  id: number;
  name: string;
  description: string;
  tier: string;
  imageUrl: string | null;
  displayOrder: number | null;
  createdAt: Date;
}

/**
 * Interpolate template strings in trophy descriptions
 * Supports {variableName} syntax
 * 
 * @example
 * interpolateDescription("Achieved {rank} place in {eventName}", { rank: "1st", eventName: "Blue Shift 2025" })
 * // Returns: "Achieved 1st place in Blue Shift 2025"
 */
export function interpolateDescription(template: string, metadata: Record<string, unknown> | null): string {
  if (!metadata) return template;
  
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = metadata[key];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Fetch trophies for a user with optional limit
 * Returns trophies ordered by displayOrder (nulls last), then by createdAt desc
 */
export async function getUserTrophies(
  prisma: PrismaClient,
  userId: string,
  limit: number = 8
): Promise<TrophyResponse[]> {
  const userTrophies = await prisma.userTrophy.findMany({
    where: { userId },
    include: {
      trophy: true,
    },
    orderBy: [
      // Trophies with displayOrder set come first, ordered by displayOrder
      { displayOrder: 'asc' },
      // Then by most recently earned
      { createdAt: 'desc' },
    ],
    take: limit,
  });

  return userTrophies.map((ut) => ({
    id: ut.trophy.id,
    name: ut.trophy.name,
    description: interpolateDescription(ut.trophy.description, ut.metadata as Record<string, unknown> | null),
    tier: ut.trophy.tier,
    imageUrl: ut.trophy.imageUrl ? assetS3UrlToCloudFrontUrl(ut.trophy.imageUrl) : null,
    displayOrder: ut.displayOrder,
    createdAt: ut.createdAt,
  }));
}

/**
 * Award a trophy to a user
 */
export async function awardTrophy(
  prisma: PrismaClient,
  userId: string,
  trophyId: number,
  metadata?: Prisma.InputJsonValue
): Promise<void> {
  await prisma.userTrophy.upsert({
    where: {
      userId_trophyId: { userId, trophyId },
    },
    create: {
      userId,
      trophyId,
      metadata: metadata ?? Prisma.JsonNull,
    },
    update: {
      // If trophy already exists, optionally update metadata
      ...(metadata ? { metadata } : {}),
    },
  });
}

/**
 * Update the display order for a user's trophies
 * @param trophyOrders - Array of { trophyId, displayOrder } to update
 */
export async function updateTrophyDisplayOrder(
  prisma: PrismaClient,
  userId: string,
  trophyOrders: Array<{ trophyId: number; displayOrder: number | null }>
): Promise<void> {
  await prisma.$transaction(
    trophyOrders.map(({ trophyId, displayOrder }) =>
      prisma.userTrophy.update({
        where: {
          userId_trophyId: { userId, trophyId },
        },
        data: { displayOrder },
      })
    )
  );
}
