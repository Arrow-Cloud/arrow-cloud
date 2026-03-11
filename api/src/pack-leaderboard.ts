import type { SQSEvent, SQSHandler, SQSBatchResponse } from 'aws-lambda';
import { PrismaClient } from '../prisma/generated/client';
import { ScoreSubmissionEvent, EVENT_TYPES } from './utils/events';
import { getDatabaseUrl } from './utils/secrets';
import { calculatePackLeaderboards, type PackLeaderboardOutput } from './utils/pack-leaderboard';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Hard-coded eligible pack IDs — only these packs get leaderboards computed.
// ---------------------------------------------------------------------------
const ELIGIBLE_PACK_IDS: number[] = [131];

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
 * Given a chart hash, find all pack IDs it belongs to that are eligible.
 */
async function getEligiblePackIdsForChart(prismaClient: PrismaClient, chartHash: string): Promise<number[]> {
  const simfileCharts = await prismaClient.simfileChart.findMany({
    where: { chartHash },
    select: {
      simfile: {
        select: { packId: true },
      },
    },
  });

  const packIds = [...new Set(simfileCharts.map((sc) => sc.simfile.packId))];
  return packIds.filter((id) => ELIGIBLE_PACK_IDS.includes(id));
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

  const packIds = await getEligiblePackIdsForChart(prismaClient, chartHash);

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
