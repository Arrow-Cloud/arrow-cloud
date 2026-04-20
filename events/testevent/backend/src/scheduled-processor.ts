import type { ScheduledHandler } from 'aws-lambda';
import {
  apiFetch,
  getState,
  putState,
  buildPlayData,
  buildBestData,
  recomputeUserSummary,
  EVENT_SLUG,
  EVENT_ID,
  LEADERBOARD_TYPE,
  type ChartMeta,
  type BestItem,
  type BackfillApiResponse,
  type BackfillChart,
  type BackfillPlay,
} from './shared';

/**
 * Convert a BackfillChart (from the API) into a ChartMeta (used by DDB record builders).
 */
function toChartMeta(chart: BackfillChart): ChartMeta {
  return {
    songName: chart.songName,
    artist: chart.artist,
    stepartist: chart.stepartist,
    stepsType: chart.stepsType,
    difficulty: chart.difficulty,
    difficultyRating: chart.meter,
    bannerUrl: chart.bannerUrl,
    mdBannerUrl: chart.mdBannerUrl,
    smBannerUrl: chart.smBannerUrl,
    bannerVariants: chart.bannerVariants,
    maxPoints: chart.maxPoints,
  };
}

/**
 * Fetch all event plays from the backfill API. Supports incremental sync via `since`.
 */
async function fetchBackfillData(since?: string): Promise<BackfillApiResponse> {
  const params = new URLSearchParams({ leaderboardType: LEADERBOARD_TYPE });
  if (since) params.set('since', since);
  return apiFetch<BackfillApiResponse>(`/event/${EVENT_ID}/backfill?${params}`);
}

/**
 * Full reconciliation pipeline:
 *
 * 1. Fetch all plays from the source-of-truth API
 * 2. Write/refresh CHART#META items
 * 3. Backfill any missing PLAY items
 * 4. Reconcile BEST items (correct stale/wrong bests)
 * 5. Recompute USER_SUMMARY for affected users
 */
async function reconcile(since?: string): Promise<{
  chartsRefreshed: number;
  playsWritten: number;
  bestsFixed: number;
  summariesRecomputed: number;
}> {
  const { charts, plays } = await fetchBackfillData(since);

  // --- Step 1: Build chart metadata map & write CHART#META items ---
  const chartMetaMap = new Map<string, ChartMeta>();
  for (const chart of charts) {
    const meta = toChartMeta(chart);
    chartMetaMap.set(chart.chartHash, meta);
    await putState(`CHART#${chart.chartHash}`, '#META', { ...meta, type: 'CHART_META' });
  }

  // --- Step 2: Group plays by user, backfill missing PLAY items ---
  // Track: per-user, per-chart → best play (highest score) from API
  const userPlays = new Map<string, { alias: string; chartBests: Map<string, BackfillPlay> }>();
  let playsWritten = 0;

  for (const play of plays) {
    const chartMeta = chartMetaMap.get(play.chartHash);
    if (!chartMeta) continue;

    // Track best-per-chart from API data
    let userData = userPlays.get(play.userId);
    if (!userData) {
      userData = { alias: play.playerAlias, chartBests: new Map() };
      userPlays.set(play.userId, userData);
    }
    const currentApiBest = userData.chartBests.get(play.chartHash);
    if (!currentApiBest || play.score > currentApiBest.score) {
      userData.chartBests.set(play.chartHash, play);
    }

    // Check if PLAY item exists; write if missing
    const sk = `PLAY#${play.createdAt}#${play.playId}`;
    const existing = await getState(`USER#${play.userId}`, sk);
    if (!existing) {
      const { data, gsiKeys } = buildPlayData(
        { playId: play.playId, userId: play.userId, playerAlias: play.playerAlias, score: play.score, grade: play.grade, timestamp: play.createdAt },
        play.chartHash,
        chartMeta,
      );
      await putState(`USER#${play.userId}`, sk, data, gsiKeys);
      playsWritten++;
    }
  }

  // --- Step 3: Reconcile BEST items ---
  let bestsFixed = 0;
  const affectedUserIds = new Set<string>();

  for (const [userId, { alias, chartBests }] of userPlays) {
    for (const [chartHash, apiBest] of chartBests) {
      const chartMeta = chartMetaMap.get(chartHash)!;
      const currentBest = await getState<BestItem>(`USER#${userId}`, `BEST#${chartHash}`);

      // Write BEST if missing, or if the API has a higher score, or if chart metadata changed
      const needsUpdate = !currentBest || apiBest.score > currentBest.score || currentBest.points === undefined;

      if (needsUpdate) {
        const bestPlay = apiBest;
        const { data, gsiKeys } = buildBestData(
          { playId: bestPlay.playId, userId, playerAlias: alias, score: bestPlay.score, grade: bestPlay.grade, timestamp: bestPlay.createdAt },
          chartHash,
          chartMeta,
        );
        await putState(`USER#${userId}`, `BEST#${chartHash}`, data, gsiKeys);
        bestsFixed++;
        affectedUserIds.add(userId);
      }
    }
  }

  // --- Step 4: Recompute USER_SUMMARY for affected users ---
  for (const userId of affectedUserIds) {
    const userData = userPlays.get(userId)!;
    await recomputeUserSummary(userId, userData.alias);
  }

  return {
    chartsRefreshed: charts.length,
    playsWritten,
    bestsFixed,
    summariesRecomputed: affectedUserIds.size,
  };
}

export const handler: ScheduledHandler = async () => {
  console.log(`[${EVENT_SLUG}] Scheduled reconciliation at ${new Date().toISOString()}`);

  // TODO: Could store last successful run timestamp in DDB and pass as `since` for incremental sync
  const result = await reconcile();

  console.log(
    `[${EVENT_SLUG}] Reconciliation complete: ` +
      `${result.chartsRefreshed} charts refreshed, ` +
      `${result.playsWritten} plays backfilled, ` +
      `${result.bestsFixed} bests fixed, ` +
      `${result.summariesRecomputed} summaries recomputed`,
  );
};
