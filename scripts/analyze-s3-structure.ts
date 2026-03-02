import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3Client = new S3Client();
const BUCKET = 'arrow-cloud-scores';

// Usage: npx tsx scripts/analyze-s3-structure.ts [--chart-hashes-only]
(async () => {
  const chartHashesOnly = process.argv.includes('--chart-hashes-only');

  let continuationToken: string | undefined;
  const chartHashes = new Set<string>();
  const userIds = new Set<string>();
  const userScoreCounts = new Map<string, number>();
  let totalFiles = 0;

  console.log('🔍 Analyzing S3 bucket structure...');

  do {
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: 'scores/',
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      });

      const listResponse = await s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        break;
      }

      console.log(`📦 Processing ${listResponse.Contents.length} files...`);

      for (const object of listResponse.Contents) {
        if (!object.Key) continue;

        // Parse key: scores/{chartHash}/{userId}/{timestamp}.json
        const keyParts = object.Key.split('/');
        if (keyParts.length === 4 && keyParts[0] === 'scores' && keyParts[3].endsWith('.json')) {
          const [, chartHash, userId] = keyParts;
          chartHashes.add(chartHash);
          userIds.add(userId);

          // Count scores per user
          const currentCount = userScoreCounts.get(userId) || 0;
          userScoreCounts.set(userId, currentCount + 1);

          totalFiles++;

          if (!chartHashesOnly && totalFiles % 1000 === 0) {
            console.log(`⏳ Processed ${totalFiles} files...`);
          }
        }
      }

      continuationToken = listResponse.NextContinuationToken;
    } catch (error) {
      console.error('❌ Error listing S3 objects:', error);
      break;
    }
  } while (continuationToken);

  console.log('\n📊 Analysis Complete!');
  console.log(`Total score files: ${totalFiles}`);
  console.log(`Unique chart hashes: ${chartHashes.size}`);
  console.log(`Unique user IDs: ${userIds.size}`);

  if (chartHashesOnly) {
    console.log('\n🎵 Chart Hashes found:');
    Array.from(chartHashes)
      .sort()
      .forEach((hash) => console.log(hash));
  } else {
    console.log('\n👥 User IDs found:');
    Array.from(userIds)
      .sort()
      .forEach((id) => console.log(id));

    console.log('\n� Scores per user:');
    const sortedUsers = Array.from(userScoreCounts.entries()).sort((a, b) => b[1] - a[1]); // Sort by score count descending

    sortedUsers.forEach(([userId, count]) => {
      console.log(`${userId}: ${count} scores`);
    });

    // Statistics about score distribution
    const scoreCounts = Array.from(userScoreCounts.values());
    const maxScores = Math.max(...scoreCounts);
    const minScores = Math.min(...scoreCounts);
    const avgScores = scoreCounts.reduce((a, b) => a + b, 0) / scoreCounts.length;

    console.log('\n📈 Score Distribution Stats:');
    console.log(`   Max scores per user: ${maxScores}`);
    console.log(`   Min scores per user: ${minScores}`);
    console.log(`   Average scores per user: ${avgScores.toFixed(2)}`);

    console.log('\n�📄 Sample user mapping template:');
    const sampleMapping = Array.from(userIds)
      .slice(0, 5)
      .reduce(
        (acc, oldId) => {
          acc[oldId] = `new-user-id-for-${oldId}`;
          return acc;
        },
        {} as Record<string, string>,
      );
    console.log(JSON.stringify(sampleMapping, null, 2));
  }
})();
