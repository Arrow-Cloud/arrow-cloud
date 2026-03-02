import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient } from '../api/prisma/generated/client';

const prisma = new PrismaClient();
const s3Client: S3Client = new S3Client();
const BUCKET = 'arrow-cloud-mock-scores';

async function cleanupS3Data(chartHash: string): Promise<void> {
  console.log(`Cleaning up S3 data for chart: ${chartHash}`);

  const prefix = `scores/${chartHash}/`;

  try {
    // List all objects with the chart hash prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
    });

    const response = await s3Client.send(listCommand);

    if (!response.Contents || response.Contents.length === 0) {
      console.log(`No S3 objects found for chart: ${chartHash}`);
      return;
    }

    console.log(`Found ${response.Contents.length} S3 objects to delete`);

    // Delete each object
    await Promise.all(
      response.Contents.map(async (object) => {
        if (object.Key) {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: object.Key,
          });

          await s3Client.send(deleteCommand);
          console.log(`Deleted S3 object: ${object.Key}`);
        }
      }),
    );

    console.log(`Completed S3 cleanup for chart: ${chartHash}`);
  } catch (error) {
    console.error(`Failed to cleanup S3 data for chart ${chartHash}:`, error);
    throw error;
  }
}

async function cleanupDatabaseData(chartHash: string): Promise<void> {
  console.log(`Cleaning up database data for chart: ${chartHash}`);

  try {
    // Get all plays for this chart to clean up related data
    const plays = await prisma.play.findMany({
      where: { chartHash },
      select: { id: true },
    });

    const playIds = plays.map((play) => play.id);
    console.log(`Found ${playIds.length} plays to clean up`);

    if (playIds.length > 0) {
      // Delete lifebars associated with these plays
      const deletedLifebars = await prisma.lifebar.deleteMany({
        where: { playId: { in: playIds } },
      });
      console.log(`Deleted ${deletedLifebars.count} lifebars`);

      // Delete play leaderboard entries
      const deletedPlayLeaderboards = await prisma.playLeaderboard.deleteMany({
        where: { playId: { in: playIds } },
      });
      console.log(`Deleted ${deletedPlayLeaderboards.count} play leaderboard entries`);

      // Delete plays
      const deletedPlays = await prisma.play.deleteMany({
        where: { chartHash },
      });
      console.log(`Deleted ${deletedPlays.count} plays`);
    }

    // Delete chart leaderboard entries
    const deletedChartLeaderboards = await prisma.chartLeaderboard.deleteMany({
      where: { chartHash },
    });
    console.log(`Deleted ${deletedChartLeaderboards.count} chart leaderboard entries`);

    // Finally, delete the chart itself
    const deletedChart = await prisma.chart.delete({
      where: { hash: chartHash },
    });
    console.log(`Deleted chart: ${deletedChart.songName} by ${deletedChart.artist}`);

    console.log(`Completed database cleanup for chart: ${chartHash}`);
  } catch (error) {
    console.error(`Failed to cleanup database data for chart ${chartHash}:`, error);
    throw error;
  }
}

// usage: npx tsx scripts/cleanup-chart.ts {chart_hash}
(async () => {
  const chartHash = process.argv[2];

  if (!chartHash) {
    console.error('Usage: npx tsx scripts/cleanup-chart.ts {chart_hash}');
    process.exit(1);
  }

  console.log(`Starting cleanup for chart hash: ${chartHash}`);

  try {
    // First check if the chart exists
    const chart = await prisma.chart.findUnique({
      where: { hash: chartHash },
      select: { hash: true, songName: true, artist: true },
    });

    if (!chart) {
      console.log(`Chart with hash ${chartHash} not found in database`);
      return;
    }

    console.log(`Found chart: ${chart.songName} by ${chart.artist}`);

    await cleanupS3Data(chartHash);
    await cleanupDatabaseData(chartHash);

    console.log(`✅ Successfully cleaned up all data for chart: ${chartHash}`);
  } catch (error) {
    console.error(`❌ Failed to cleanup chart ${chartHash}:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
