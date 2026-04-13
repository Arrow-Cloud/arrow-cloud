import type { ScheduledHandler } from 'aws-lambda';
import {
  EVENT_SLUG,
  CHART_HASHES,
  queryGsi,
  queryState,
  getState,
  updateGsiKeys,
  updateAttributes,
  scoreToSortKey,
  pointsToSortKey,
} from './shared';

interface BestItem {
  pk: string;
  sk: string;
  chartHash: string;
  score: number;
  userId: string;
  timestamp: string;
  playerAlias?: string;
  gsi1pk?: string;
  gsi2pk?: string;
}

interface UserSummary {
  pk: string;
  sk: string;
  totalPoints: number;
  userId: string;
  playerAlias: string;
  gsi2pk?: string;
}

/**
 * Backfill GSI keys and missing fields on existing BEST and USER_SUMMARY items.
 * Uses conditional writes for GSI keys (safe to run repeatedly).
 * Also patches playerAlias onto BEST items that are missing it.
 */
async function backfillGsiKeys(): Promise<{ bests: number; summaries: number; aliases: number }> {
  // Discover all user IDs from chart plays
  const allUserIds = new Set<string>();
  for (const chartHash of CHART_HASHES) {
    const plays = await queryGsi<{ userId: string }>(
      'gsi1', 'gsi1pk', `CHART#${chartHash}`, { scanForward: false, limit: 1000 },
    );
    for (const play of plays) {
      if (play.userId) allUserIds.add(play.userId);
    }
  }

  let bestsUpdated = 0;
  let summariesUpdated = 0;
  let aliasesPatched = 0;

  for (const userId of allUserIds) {
    // Get user summary first (need playerAlias for BEST backfill)
    const summary = await getState<UserSummary>(`USER#${userId}`, '#SUMMARY');
    const playerAlias = summary?.playerAlias;

    // Backfill BEST items with GSI keys + playerAlias
    const bests = await queryState<BestItem>(`USER#${userId}`, 'BEST#');
    for (const best of bests) {
      if (!best.chartHash || !best.score) continue;

      // GSI1: chart leaderboard sorted by score
      const gsi1Updated = await updateGsiKeys(best.pk, best.sk, {
        gsi1pk: `CHARTBEST#${best.chartHash}`,
        gsi1sk: `${scoreToSortKey(best.score)}#${userId}`,
      });
      if (gsi1Updated) bestsUpdated++;

      // GSI2: chart bests sorted by time
      if (best.timestamp) {
        await updateGsiKeys(best.pk, best.sk, {
          gsi2pk: `CHARTTIME#${best.chartHash}`,
          gsi2sk: `${best.timestamp}#${userId}`,
        });
      }

      // Patch playerAlias if missing
      if (!best.playerAlias && playerAlias) {
        await updateAttributes(best.pk, best.sk, { playerAlias });
        aliasesPatched++;
      }
    }

    // Backfill USER_SUMMARY with GSI2 keys (for leaderboard)
    if (summary && summary.totalPoints !== undefined) {
      const updated = await updateGsiKeys(summary.pk, summary.sk, {
        gsi2pk: 'LEADERBOARD',
        gsi2sk: `${pointsToSortKey(summary.totalPoints)}#${userId}`,
      });
      if (updated) summariesUpdated++;
    }
  }

  return { bests: bestsUpdated, summaries: summariesUpdated, aliases: aliasesPatched };
}

export const handler: ScheduledHandler = async () => {
  console.log(
    `[${EVENT_SLUG}] Scheduled run at ${new Date().toISOString()} — ${CHART_HASHES.length} charts configured`,
  );

  const result = await backfillGsiKeys();
  console.log(
    `[${EVENT_SLUG}] GSI backfill: ${result.bests} bests, ${result.summaries} summaries, ${result.aliases} aliases updated`,
  );
};
