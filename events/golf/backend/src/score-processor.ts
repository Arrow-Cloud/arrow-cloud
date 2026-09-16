import type { SQSHandler, SQSBatchResponse, SQSRecord } from 'aws-lambda';
import { apiFetch, getState, putState, EVENT_SLUG, type PlayApiResponse, type BestItem } from './shared';
import { calculateGolfStrokes } from '../../../../api/src/utils/scoring/golf';

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
 * Process a single score submission for golf.
 *
 * Mirrors events/testevent/backend/src/score-processor.ts's shape, but golf strokes aren't a
 * standard leaderboard type, so this fetches the raw timingData/radar from /play/{id} (the same
 * public, unauthenticated endpoint testevent already relies on - not S3/Postgres directly, keeping
 * this Lambda fully isolated from core storage) and computes strokes itself via the shared pure
 * formula, rather than reading a pre-computed score.
 *
 * 1. Fetch play details (timingData + radar) from the public API
 * 2. Compute strokes
 * 3. Write denormalized PLAY item
 * 4. Update BEST only if this total is lower (golf is lower-is-better - inverted from testevent's
 *    score > currentBest.score)
 */
async function processRecord(record: SQSRecord): Promise<void> {
  const snsWrapper = JSON.parse(record.body);
  const event: ScoreSubmissionEvent = JSON.parse(snsWrapper.Message);

  console.log(`[${EVENT_SLUG}] Score received: chart=${event.chartHash} user=${event.userId} play=${event.play.id}`);

  const play = await apiFetch<PlayApiResponse>(`/play/${event.play.id}`);

  if (!play.timingData || !play.radar) {
    console.warn(`[${EVENT_SLUG}] No timingData/radar available for play ${event.play.id} - skipping`);
    return;
  }

  const { totalStrokes, noteCount } = calculateGolfStrokes({ timingData: play.timingData, radar: play.radar });

  const timestamp = play.createdAt;
  const playId = play.id;
  const userId = play.user.id;

  // 1. Write PLAY item - denormalized, queryable by user+chart+time.
  await putState(`USER#${userId}`, `PLAY#${event.chartHash}#${timestamp}#${playId}`, {
    type: 'PLAY',
    playId,
    userId,
    chartHash: event.chartHash,
    totalStrokes,
    noteCount,
    timestamp,
  });

  // 2. Check/update personal best - lower strokes is better.
  const currentBest = await getState<BestItem>(`USER#${userId}`, `BEST#${event.chartHash}`);
  if (!currentBest || totalStrokes < currentBest.totalStrokes) {
    await putState(`USER#${userId}`, `BEST#${event.chartHash}`, {
      type: 'BEST',
      playId,
      userId,
      chartHash: event.chartHash,
      totalStrokes,
    });
  }
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
