import { PrismaClient, Prisma } from '../api/prisma/generated/client';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();
const s3Client = new S3Client();

const BATCH_SIZE = 100;

interface Modifiers {
  visualDelay: number;
  acceleration: unknown[];
  appearance: unknown[];
  effect: unknown[];
  mini: number;
  turn: string;
  disabledWindows: string;
  speed: {
    value: number;
    type: string;
  };
  perspective: string;
  noteskin: string;
}

async function loadModifiersFromS3(rawTimingDataUrl: string): Promise<Modifiers | null> {
  try {
    // Parse S3 URL: s3://bucket/key
    const url = new URL(rawTimingDataUrl);
    const bucket = url.hostname;
    const key = url.pathname.slice(1); // Remove leading /

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);

    if (!response.Body) {
      return null;
    }

    const bodyString = await response.Body.transformToString();
    const data = JSON.parse(bodyString);

    return data.modifiers || null;
  } catch (error) {
    console.error(`Failed to load from S3: ${rawTimingDataUrl}`, error);
    return null;
  }
}

async function processPlay(playId: number, rawTimingDataUrl: string): Promise<boolean> {
  const modifiers = await loadModifiersFromS3(rawTimingDataUrl);

  if (!modifiers) {
    console.log(`  Play ${playId}: No modifiers found`);
    return false;
  }

  await prisma.play.update({
    where: { id: playId },
    data: { modifiers },
  });

  return true;
}

// usage: npx tsx scripts/backfill-play-modifiers.ts [playId]
// If playId is provided, only process that play
// Otherwise, process all plays in batches
(async () => {
  const playIdArg = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;

  try {
    if (playIdArg) {
      // Single play mode
      console.log(`Processing single play: ${playIdArg}`);

      const play = await prisma.play.findUnique({
        where: { id: playIdArg },
        select: { id: true, rawTimingDataUrl: true },
      });

      if (!play) {
        console.error(`Play ${playIdArg} not found`);
        process.exit(1);
      }

      const success = await processPlay(play.id, play.rawTimingDataUrl);
      console.log(success ? 'Successfully updated modifiers' : 'No modifiers found in S3 data');
    } else {
      // Batch mode - process all plays
      console.log(`Processing all plays in batches of ${BATCH_SIZE} (parallel within batch)`);

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
            modifiers: { equals: Prisma.DbNull }, // Only process plays without modifiers
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

        console.log(`\nProcessing batch of ${plays.length} plays (starting at ID ${plays[0].id})...`);

        // Process plays in parallel within the batch
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

        // Update cursor to last play ID
        cursor = plays[plays.length - 1].id;

        console.log(`Progress: ${totalProcessed} processed, ${successCount} updated, ${failedCount} failed/skipped`);
      }

      console.log(`\nCompleted! Processed ${totalProcessed} plays (${successCount} updated, ${failedCount} failed/skipped)`);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
