import type { SQSHandler, SQSBatchResponse, SQSRecord } from 'aws-lambda';
import {
  apiFetch,
  calculatePoints,
  extractScore,
  getState,
  putState,
  queryState,
  scoreToSortKey,
  pointsToSortKey,
  EVENT_SLUG,
  EVENT_ID,
  type PlayApiResponse,
  type EventChartApiResponse,
} from './shared';

interface ScoreSubmissionEvent {
  eventType: string;
  timestamp: string;
  userId: string;
  chartHash: string;
  play: {
    id: string;
    rawTimingDataUrl: string;
  };
}

interface ChartMeta {
  songName: string;
  artist: string;
  stepartist: string;
  stepsType: string | null;
  difficulty: string;
  difficultyRating: number;
  bannerUrl: string | null;
  mdBannerUrl: string | null;
  smBannerUrl: string | null;
  bannerVariants?: Record<string, unknown> | null;
  maxPoints: number;
}

interface BestItem {
  pk: string;
  sk: string;
  score: number;
  points: number;
}

/**
 * Fetch chart metadata from DynamoDB cache, falling back to the event chart API.
 * Uses GET /event/{eventId}/chart/{chartHash} which returns both event metadata
 * (including points) and chart details in a single call.
 */
async function getChartMeta(chartHash: string): Promise<ChartMeta> {
  const cached = await getState<ChartMeta>(`CHART#${chartHash}`, '#META');
  // Re-fetch if cached data is missing banner variant fields (added after initial cache)
  if (cached?.songName && 'mdBannerUrl' in cached && 'stepsType' in cached) return cached;

  const { eventChart } = await apiFetch<EventChartApiResponse>(`/event/${EVENT_ID}/chart/${chartHash}`);

  const chart = eventChart.chart;
  const meta: ChartMeta = {
    songName: chart.songName || 'Unknown',
    artist: chart.artist || 'Unknown',
    stepartist: chart.stepartist || chart.credit || 'Unknown',
    stepsType: chart.stepsType || null,
    difficulty: chart.difficulty || 'Unknown',
    difficultyRating: chart.meter ?? chart.rating ?? 0,
    bannerUrl: chart.bannerUrl || null,
    mdBannerUrl: chart.mdBannerUrl || null,
    smBannerUrl: chart.smBannerUrl || null,
    bannerVariants: chart.bannerVariants || null,
    maxPoints: (eventChart.metadata as { points?: number }).points || 0,
  };

  await putState(`CHART#${chartHash}`, '#META', { ...meta, type: 'CHART_META' });
  return meta;
}

/**
 * Recompute a user's summary from their personal bests.
 */
async function recomputeUserSummary(userId: string, playerAlias: string): Promise<void> {
  const bests = await queryState<BestItem>(`USER#${userId}`, 'BEST#');

  let totalScore = 0;
  let totalPoints = 0;
  let chartsPlayed = 0;

  for (const best of bests) {
    totalScore += best.score || 0;
    totalPoints += best.points || 0;
    chartsPlayed++;
  }

  // Count total plays from PLAY items
  const plays = await queryState<{ pk: string }>(`USER#${userId}`, 'PLAY#');

  await putState(
    `USER#${userId}`,
    '#SUMMARY',
    {
      type: 'USER_SUMMARY',
      userId,
      playerAlias,
      totalScore,
      totalPoints,
      chartsPlayed,
      totalPlays: plays.length,
      lastPlayAt: new Date().toISOString(),
    },
    {
      gsi2pk: 'LEADERBOARD',
      gsi2sk: `${pointsToSortKey(totalPoints)}#${userId}`,
    },
  );
}

/**
 * Process a single score submission.
 *
 * 1. Fetch play details from the API (score, user, chart metadata)
 * 2. Write denormalized PLAY item (queryable by user, chart, and globally)
 * 3. Check/update personal best for this user+chart
 * 4. Recompute user summary
 */
async function processRecord(record: SQSRecord): Promise<void> {
  const snsWrapper = JSON.parse(record.body);
  const event: ScoreSubmissionEvent = JSON.parse(snsWrapper.Message);

  console.log(`[${EVENT_SLUG}] Score received: chart=${event.chartHash} user=${event.userId} play=${event.play.id}`);

  // Fetch enriched play data from the API
  const play = await apiFetch<PlayApiResponse>(`/play/${event.play.id}`);
  const chartMeta = await getChartMeta(event.chartHash);
  const scoreData = extractScore(play.leaderboards);

  if (!scoreData) {
    console.warn(`[${EVENT_SLUG}] No score found for leaderboard type on play ${event.play.id}`);
    return;
  }

  const timestamp = play.createdAt;
  const playId = play.id;
  const userId = play.user.id;
  const playerAlias = play.user.alias;
  const points = calculatePoints(scoreData.score, chartMeta.maxPoints);

  // 1. Write PLAY item — denormalized with all metadata for flexible querying
  await putState(
    `USER#${userId}`,
    `PLAY#${timestamp}#${playId}`,
    {
      type: 'PLAY',
      playId,
      userId,
      playerAlias,
      chartHash: event.chartHash,
      songName: chartMeta.songName,
      artist: chartMeta.artist,
      stepartist: chartMeta.stepartist,
      stepsType: chartMeta.stepsType,
      difficulty: chartMeta.difficulty,
      difficultyRating: chartMeta.difficultyRating,
      bannerUrl: chartMeta.bannerUrl,
      mdBannerUrl: chartMeta.mdBannerUrl,
      smBannerUrl: chartMeta.smBannerUrl,
      bannerVariants: chartMeta.bannerVariants || null,
      score: scoreData.score,
      grade: scoreData.grade,
      points,
      maxPoints: chartMeta.maxPoints,
      timestamp,
    },
    {
      gsi1pk: `CHART#${event.chartHash}`,
      gsi1sk: `${timestamp}#${playId}`,
      gsi2pk: 'ACTIVITY',
      gsi2sk: `${timestamp}#${playId}`,
    },
  );

  // 2. Check/update personal best
  const currentBest = await getState<BestItem>(`USER#${userId}`, `BEST#${event.chartHash}`);
  if (!currentBest || scoreData.score > currentBest.score) {
    await putState(
      `USER#${userId}`,
      `BEST#${event.chartHash}`,
      {
        type: 'BEST',
        playId,
        userId,
        chartHash: event.chartHash,
        songName: chartMeta.songName,
        artist: chartMeta.artist,
        stepartist: chartMeta.stepartist,
        stepsType: chartMeta.stepsType,
        difficulty: chartMeta.difficulty,
        difficultyRating: chartMeta.difficultyRating,
        bannerUrl: chartMeta.bannerUrl,
        mdBannerUrl: chartMeta.mdBannerUrl,
        smBannerUrl: chartMeta.smBannerUrl,
        bannerVariants: chartMeta.bannerVariants || null,
        score: scoreData.score,
        grade: scoreData.grade,
        points,
        maxPoints: chartMeta.maxPoints,
        timestamp,
        playerAlias,
      },
      {
        gsi1pk: `CHARTBEST#${event.chartHash}`,
        gsi1sk: `${scoreToSortKey(scoreData.score)}#${userId}`,
        gsi2pk: `CHARTTIME#${event.chartHash}`,
        gsi2sk: `${timestamp}#${userId}`,
      },
    );
  }

  // 3. Recompute user summary
  await recomputeUserSummary(userId, playerAlias);
}

export const handler: SQSHandler = async (sqsEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of sqsEvent.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error(`Failed to process record ${record.messageId}:`, error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
