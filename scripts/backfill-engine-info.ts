import { PrismaClient } from '../api/prisma/generated/client';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();
const s3Client = new S3Client();

const BATCH_SIZE = 100;
const CUTOFF_DATE = new Date('2026-02-27T00:00:00.000Z');

async function loadEngineInfoFromS3(rawTimingDataUrl: string): Promise<{ engineName: string; engineVersion?: string } | null> {
  try {
    const url = new URL(rawTimingDataUrl);
    const bucket = url.hostname;
    const key = url.pathname.slice(1);

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);

    if (!response.Body) {
      return null;
    }

    const bodyString = await response.Body.transformToString();
    const data = JSON.parse(bodyString);

    // Only return if the payload actually has engine info
    // _engineName defaults to ITGMania per the zod schema, so if it's absent
    // the play was submitted before this field existed — use the default
    const engineName = data._engineName || 'ITGMania';
    const engineVersion = data._engineVersion || undefined;

    return { engineName, engineVersion };
  } catch (error) {
    console.error(`Failed to load from S3: ${rawTimingDataUrl}`, error);
    return null;
  }
}

async function processPlay(playId: number, rawTimingDataUrl: string): Promise<boolean> {
  const info = await loadEngineInfoFromS3(rawTimingDataUrl);

  if (!info) {
    console.log(`  Play ${playId}: No S3 data found`);
    return false;
  }

  await prisma.play.update({
    where: { id: playId },
    data: {
      engineName: info.engineName,
      ...(info.engineVersion && { engineVersion: info.engineVersion }),
    },
  });

  console.log(`  Play ${playId}: ${info.engineName}${info.engineVersion ? ` v${info.engineVersion}` : ''}`);
  return true;
}

// usage: npx tsx scripts/backfill-engine-info.ts
(async () => {
  try {
    console.log(`Backfilling engineName/engineVersion for plays created on or after ${CUTOFF_DATE.toISOString()}`);
    console.log(`Processing in batches of ${BATCH_SIZE} (parallel within batch)\n`);

    let cursor: number | undefined = undefined;
    let totalProcessed = 0;
    let successCount = 0;
    let failedCount = 0;

    while (true) {
      const plays = await prisma.play.findMany({
        take: BATCH_SIZE,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        where: {
          createdAt: { gte: CUTOFF_DATE },
        },
        select: {
          id: true,
          rawTimingDataUrl: true,
        },
        orderBy: {
          id: 'asc',
        },
      });

      if (plays.length === 0) break;

      console.log(`Processing batch of ${plays.length} plays (starting at ID ${plays[0].id})...`);

      const results = await Promise.all(
        plays.map(async (play) => {
          try {
            return await processPlay(play.id, play.rawTimingDataUrl);
          } catch (error) {
            console.error(`  Play ${play.id}: Error`, error);
            return false;
          }
        }),
      );

      const batchSuccess = results.filter(Boolean).length;
      const batchFailed = results.length - batchSuccess;

      totalProcessed += plays.length;
      successCount += batchSuccess;
      failedCount += batchFailed;

      cursor = plays[plays.length - 1].id;

      console.log(`Progress: ${totalProcessed} processed, ${successCount} updated, ${failedCount} failed/skipped\n`);
    }

    console.log(`Completed! Processed ${totalProcessed} plays (${successCount} updated, ${failedCount} failed/skipped)`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
