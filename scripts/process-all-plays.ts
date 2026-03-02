import { PrismaClient } from '../api/prisma/generated/client';
import { S3Client } from '@aws-sdk/client-s3';
import { processSinglePlay } from '../api/src/utils/play-processor';

const prisma = new PrismaClient();
const s3Client = new S3Client();

const BATCH_SIZE = 100;

// usage: npx tsx scripts/process-all-plays.ts [limit]
(async () => {
  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;

  console.log('Processing plays from database...');
  if (limit) {
    console.log(`Limiting to ${limit} plays`);
  }
  console.log(`Processing in batches of ${BATCH_SIZE}`);

  try {
    await prisma.playLeaderboard.deleteMany(); // Clear existing leaderboard entries
    console.log('Cleared existing leaderboard entries');

    let cursor: number | undefined = undefined;
    let totalProcessed = 0;
    let failedCount = 0;

    while (true) {
      // Calculate how many to fetch this batch
      const remaining = limit ? limit - totalProcessed : undefined;
      const take = remaining ? Math.min(BATCH_SIZE, remaining) : BATCH_SIZE;

      if (take <= 0) break;

      const plays = await prisma.play.findMany({
        take,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        include: {
          user: {
            select: {
              id: true,
              alias: true,
            },
          },
          leaderboards: {
            select: {
              id: true,
              type: true,
            },
          },
        },
        orderBy: {
          id: 'asc',
        },
      });

      if (plays.length === 0) break;

      console.log(`\nProcessing batch of ${plays.length} plays (${totalProcessed + 1} - ${totalProcessed + plays.length})...`);

      // Process plays in this batch sequentially to avoid overwhelming connections
      for (const play of plays) {
        try {
          await processSinglePlay(play, prisma, s3Client);
          totalProcessed++;
        } catch (error) {
          console.error(`Failed to process play ${play.id}:`, error);
          failedCount++;
          totalProcessed++;
          // Continue processing other plays even if one fails
        }
      }

      // Update cursor to last play ID
      cursor = plays[plays.length - 1].id;

      console.log(`Progress: ${totalProcessed} plays processed, ${failedCount} failed`);
    }

    console.log(`\nCompleted! Processed ${totalProcessed} plays (${failedCount} failed)`);
  } catch (error) {
    console.error('Error processing plays:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
