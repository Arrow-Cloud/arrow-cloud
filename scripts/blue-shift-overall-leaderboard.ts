import { PrismaClient } from '../api/prisma/generated/client';
import {
  calculatePointsForRank,
  getBlueShiftLeaderboardEntries,
  calculateLeaderboards,
  serializeCombinedLeaderboards,
  uploadCombinedLeaderboardToS3,
  type UserOverallScore,
  processUserData,
  getChartData,
} from '../api/src/utils/events/blueshift';
import { S3Client } from '@aws-sdk/client-s3';

const prisma = new PrismaClient({
  log: ['query'],
});

const s3Client = new S3Client();
/**
 * Print the overall leaderboard to console
 */
function printOverallLeaderboard(leaderboardType: string, leaderboard: UserOverallScore[]): void {
  console.log('\n' + '='.repeat(80));
  console.log(`BLUE SHIFT BETA EVENT - ${leaderboardType.toUpperCase()} LEADERBOARD`);
  console.log('='.repeat(80));

  console.log('\nPoints System:');
  console.log('- 1st place: 10,000 points');
  console.log('- Points decrease exponentially for lower ranks');
  console.log(
    `- Example ranks: 1st=${calculatePointsForRank(1)}, 2nd=${calculatePointsForRank(2)}, 3rd=${calculatePointsForRank(3)}, 5th=${calculatePointsForRank(5)}, 10th=${calculatePointsForRank(10)}`,
  );

  console.log('\n' + '-'.repeat(80));
  console.log(String('Rank').padEnd(6) + String('Player').padEnd(25) + String('Total Points').padEnd(15) + 'Charts Played');
  console.log('-'.repeat(80));

  leaderboard.slice(0, 10).forEach((user, index) => {
    // Show top 10
    const rank = (index + 1).toString();
    const player = user.userAlias.length > 24 ? user.userAlias.substring(0, 21) + '...' : user.userAlias;
    const totalPoints = user.totalPoints.toLocaleString();
    const chartsPlayed = user.chartScores.length.toString();

    console.log(rank.padEnd(6) + player.padEnd(25) + totalPoints.padEnd(15) + chartsPlayed);
  });

  console.log('-'.repeat(80));
  console.log(`Total participants: ${leaderboard.length}`);

  // Show detailed breakdown for top 3
  if (leaderboard.length > 0) {
    console.log('\n' + '='.repeat(40));
    console.log(`TOP 3 ${leaderboardType.toUpperCase()} BREAKDOWN`);
    console.log('='.repeat(40));

    leaderboard.slice(0, 3).forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.userAlias} - ${user.totalPoints.toLocaleString()} total points`);
      console.log('   Top chart scores:');

      const topScores = user.chartScores.sort((a, b) => b.points - a.points).slice(0, 5); // Show top 5 chart scores

      topScores.forEach((score) => {
        console.log(`     Rank ${score.rank}: ${score.points.toLocaleString()} pts (${score.chartHash.substring(0, 8)}...)`);
      });
    });
  }
}

// Usage: npx tsx scripts/blue-shift-overall-leaderboard.ts
(async () => {
  try {
    const chartData = await getChartData(prisma);
    const entries = await getBlueShiftLeaderboardEntries(prisma);
    const leaderboardsByType = calculateLeaderboards(entries);

    // Process each leaderboard type (print to console)
    for (const [leaderboardType, leaderboard] of leaderboardsByType) {
      console.log(`\nProcessing ${leaderboardType} leaderboard...`);
      printOverallLeaderboard(leaderboardType, leaderboard);
    }

    // Serialize and upload combined leaderboards to S3
    console.log('\nSerializing combined leaderboards...');
    const combinedData = serializeCombinedLeaderboards(leaderboardsByType);

    console.log('\nUploading leaderboard to S3...');
    const uploadedUrl = await uploadCombinedLeaderboardToS3(combinedData, s3Client);

    console.log(`\nCombined leaderboard uploaded successfully: ${uploadedUrl}`);
    await processUserData(entries, leaderboardsByType, s3Client, chartData);

    console.log('\nCompleted at:', new Date().toISOString());
  } catch (error) {
    console.error('Error calculating overall leaderboard:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
