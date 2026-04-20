import type { SQSHandler, SQSBatchResponse, SQSRecord } from 'aws-lambda';
import {
  apiFetch,
  extractScore,
  getState,
  putState,
  getChartMeta,
  recomputeUserSummary,
  buildPlayData,
  buildBestData,
  EVENT_SLUG,
  type PlayApiResponse,
  type BestItem,
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

  const playInput = { playId, userId, playerAlias, score: scoreData.score, grade: scoreData.grade, timestamp };

  // 1. Write PLAY item — denormalized with all metadata for flexible querying
  const { data: playData, gsiKeys: playGsi } = buildPlayData(playInput, event.chartHash, chartMeta);
  await putState(`USER#${userId}`, `PLAY#${timestamp}#${playId}`, playData, playGsi);

  // 2. Check/update personal best
  const currentBest = await getState<BestItem>(`USER#${userId}`, `BEST#${event.chartHash}`);
  if (!currentBest || scoreData.score > currentBest.score) {
    const { data: bestData, gsiKeys: bestGsi } = buildBestData(playInput, event.chartHash, chartMeta);
    await putState(`USER#${userId}`, `BEST#${event.chartHash}`, bestData, bestGsi);
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
