import type { SQSEvent, SQSHandler, SQSBatchResponse } from 'aws-lambda';
import { PrismaClient } from '../prisma/generated/client';
import { ScoreSubmissionEvent, EVENT_TYPES } from './utils/events';
import { getDatabaseUrl } from './utils/secrets';
import { calculatePackLeaderboards, type PackLeaderboardOutput, getEligiblePacksForChart } from './utils/pack-leaderboard';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { sendToUser } from './services/websocket';

let prisma: PrismaClient | undefined;
const s3Client = new S3Client();
const S3_BUCKET_ASSETS = process.env.S3_BUCKET_ASSETS || 'arrow-cloud-assets';

async function getPrismaClient(): Promise<PrismaClient> {
  if (!prisma) {
    const dbUrl = await getDatabaseUrl();
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });
  }
  return prisma;
}

/**
 * Upload a pack leaderboard JSON to S3.
 */
async function uploadPackLeaderboard(packId: number, data: PackLeaderboardOutput): Promise<string> {
  const key = `json/pack-leaderboards/${packId}.json`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET_ASSETS,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
      CacheControl: 'max-age=60', // Short cache — recalculated on each submission
    }),
  );

  return `s3://${S3_BUCKET_ASSETS}/${key}`;
}

/**
 * Process a single score submission: recalculate leaderboards for every
 * eligible pack the submitted chart belongs to.
 */
async function processScoreSubmission(event: ScoreSubmissionEvent, prismaClient: PrismaClient): Promise<void> {
  const { chartHash, userId } = event;
  console.log(`Processing pack leaderboard update for chart ${chartHash} (user ${userId})`);

  const packIds = [...new Set((await getEligiblePacksForChart(prismaClient, chartHash)).map((m) => m.packId))];

  if (packIds.length === 0) {
    console.log(`Chart ${chartHash} does not belong to any eligible pack, skipping`);
    return;
  }

  console.log(`Chart ${chartHash} belongs to eligible packs: ${packIds.join(', ')}`);

  for (const packId of packIds) {
    try {
      console.log(`Calculating leaderboards for pack ${packId}...`);
      const result = await calculatePackLeaderboards(prismaClient, packId);

      const s3Url = await uploadPackLeaderboard(packId, result);
      console.log(`Pack ${packId} leaderboard uploaded to ${s3Url}`);
      await sendToUser(userId, { type: 'refresh', data: { userId, reason: 'Pack leaderboard updated', packId, timestamp: new Date().toISOString() } }).catch(
        (err) => console.error(`[WebSocket] Failed to notify user ${userId} for pack ${packId}:`, err),
      );
    } catch (error) {
      console.error(`Failed to calculate/upload leaderboard for pack ${packId}:`, error);
      throw error; // Let it bubble up so the SQS message is retried
    }
  }
}

/**
 * SQS Handler for processing pack leaderboard updates.
 *
 * Listens to score-submitted events via SNS → SQS fan-out, determines which
 * eligible packs the chart belongs to, and recalculates + uploads their
 * overall leaderboards.
 */
export const handler: SQSHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  console.log(`Processing ${event.Records.length} pack leaderboard messages`);

  const prismaClient = await getPrismaClient();
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      // Parse the SNS-wrapped SQS message
      const snsMessage = JSON.parse(record.body);
      const scoreEvent = JSON.parse(snsMessage.Message) as { eventType: string };

      if (scoreEvent.eventType === EVENT_TYPES.SCORE_SUBMITTED) {
        await processScoreSubmission(scoreEvent as ScoreSubmissionEvent, prismaClient);
      } else {
        console.log(`Ignoring event type: ${scoreEvent.eventType}`);
      }
    } catch (error) {
      console.error(`Failed to process record ${record.messageId}:`, error);
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  if (batchItemFailures.length > 0) {
    console.log(`${batchItemFailures.length} messages failed and will be retried`);
  } else {
    console.log('All messages processed successfully');
  }

  return { batchItemFailures };
};
