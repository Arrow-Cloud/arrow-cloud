import { PrismaClient } from '../../prisma/generated/client';
import { createNotification } from './notifications';

// Trophy slug convention: `{type}_{threshold}` e.g. "quads_1", "quints_100", "hexes_10000"
// Create these in the DB manually. The backend references them by slug.

const MILESTONES = [10000, 1000, 100, 10, 1] as const; // Descending so we match highest first

type PerfectScoreType = 'quads' | 'quints' | 'hexes';

function trophySlug(type: PerfectScoreType, threshold: number): string {
  return `${type}_${threshold}`;
}

/**
 * Check whether the user's updated quad/quint/hex counts cross a milestone,
 * and if so assign the appropriate trophy (replacing any lower-tier trophy).
 *
 * Call this after updating the user's stats JSON.
 */
export async function checkAndAssignPerfectScoreTrophies(
  prisma: PrismaClient,
  userId: string,
  counts: { quads: number; quints: number; hexes: number },
): Promise<void> {
  const types: PerfectScoreType[] = ['quads', 'quints', 'hexes'];

  for (const type of types) {
    const count = counts[type];

    // Find the highest milestone the user qualifies for
    const qualifiedThreshold = MILESTONES.find((m) => count >= m);
    if (!qualifiedThreshold) continue;

    const targetSlug = trophySlug(type, qualifiedThreshold);

    // Look up the target trophy by slug
    const trophy = await prisma.trophy.findUnique({
      where: { slug: targetSlug },
    });

    if (!trophy) {
      console.warn(`Trophy not found for slug: ${targetSlug}`);
      continue;
    }

    // Check if user already has this exact trophy
    const existingAssignment = await prisma.userTrophy.findUnique({
      where: { userId_trophyId: { userId, trophyId: trophy.id } },
    });

    if (existingAssignment) continue; // Already has this tier, nothing to do

    // Gather all slugs for this type (all milestones)
    const allSlugsForType = MILESTONES.map((m) => trophySlug(type, m));

    // Find all trophies of this type that the user currently holds (lower tiers)
    const lowerTierAssignments = await prisma.userTrophy.findMany({
      where: {
        userId,
        trophy: { slug: { in: allSlugsForType } },
      },
      include: { trophy: true },
    });

    // Remove lower-tier trophies
    if (lowerTierAssignments.length > 0) {
      await prisma.userTrophy.deleteMany({
        where: {
          id: { in: lowerTierAssignments.map((a) => a.id) },
        },
      });
    }

    // Assign the new trophy
    await prisma.userTrophy.create({
      data: {
        userId,
        trophyId: trophy.id,
      },
    });

    console.log(`Assigned trophy ${targetSlug} ("${trophy.name}") to user ${userId}`);

    // Send notification
    await createNotification(prisma, {
      userId,
      type: 'trophy_earned',
      title: `You earned a trophy: ${trophy.name}! Click to manage your trophies.`,
      body: trophy.description,
      data: { route: `/profile#trophies`, trophyId: trophy.id },
    });
  }
}
