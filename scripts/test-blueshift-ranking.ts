import { PrismaClient } from '../api/prisma/generated/client';
import { z } from 'zod';

const PHASE_1_HASHES = [
  '63101ea40e1a2838',
  '55b1f5908313e8f7',
  '1734babbf57001b6',
  '17a72b694400847e',
  'a72ca72c1915692d',
  'de903492a8341699',
  '0ad686033ae7423d',
  'f9fd8685f25264a6',
  'facba50ede050e5f',
  '47a4f12d6c8406f7',
  '6696a40da7e0bb1d',
  'e9dd5d4fd1c27612',
  'ca76bc30b53309d9',
  '5b5b204347108eb7',
  'ea323cfbb64ef3ee',
  '7209bd5ea52c3ae2',
  '8406f896cdd0bee4',
  '0ae588e08c8a4cd6',
  'd535504d2c93d715',
  '1ee2fcf12a85a3da',
  '970f4177df2261ca',
  '3b18148cff6faa1b',
  '212a71f4eb1f8409',
  'e60c19fd8cde7698',
  'c727ce3b79c43e49',
];

const PHASE_1_LEADERBOARD_IDS = [8, 9, 10]; // HardEX, EX, Money

const LeaderboardEntrySchema = z.object({
  rank: z.bigint().transform((val) => Number(val)),
  data: z.any(),
  userAlias: z.string(),
  userId: z.string(),
  chartHash: z.string(),
  leaderboardType: z.string(),
  score: z.union([z.string(), z.number(), z.bigint(), z.any()]).transform((val) => {
    if (typeof val === 'object' && val !== null && 'toNumber' in val) {
      return val.toNumber(); // Prisma Decimal
    }
    return Number(val);
  }),
});

async function testRanking() {
  const prisma = new PrismaClient();

  try {
    console.log('Testing Blue Shift Phase 1 ranking query...\n');

    const rawResults = await prisma.$queryRaw`
      WITH best_scores AS (
        SELECT DISTINCT ON (p."chartHash", l.type, u.alias)
          pl.data,
          u.alias as "userAlias",
          u.id as "userId",
          p."chartHash",
          l.type as "leaderboardType",
          pl."sortKey",
          (pl.data->>'score')::decimal as score
        FROM "PlayLeaderboard" pl
        JOIN "Play" p ON pl."playId" = p.id
        JOIN "User" u ON p."userId" = u.id
        JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
        WHERE p."chartHash" = ANY(${PHASE_1_HASHES})
          AND l.id = ANY(${PHASE_1_LEADERBOARD_IDS})
        ORDER BY p."chartHash", l.type, u.alias, pl."sortKey" DESC
      )
      SELECT
        RANK() OVER (
          PARTITION BY "chartHash", "leaderboardType" 
          ORDER BY score DESC
        ) as rank,
        data,
        "userAlias",
        "userId",
        "chartHash",
        "leaderboardType",
        score
      FROM best_scores
      ORDER BY "chartHash", "leaderboardType", score DESC
    `;

    const entries = z.array(LeaderboardEntrySchema).parse(rawResults);

    console.log(`Found ${entries.length} total entries\n`);

    // Group by chart and leaderboard type to show ties
    const groupedEntries = new Map<string, typeof entries>();
    for (const entry of entries) {
      const key = `${entry.chartHash}:${entry.leaderboardType}`;
      if (!groupedEntries.has(key)) {
        groupedEntries.set(key, []);
      }
      groupedEntries.get(key)!.push(entry);
    }

    // Show a sample chart with ties (if any)
    console.log('Sample chart rankings (showing first chart with multiple entries):\n');

    for (const [key, chartEntries] of groupedEntries) {
      if (chartEntries.length > 1) {
        const [chartHash, leaderboardType] = key.split(':');
        console.log(`Chart: ${chartHash.substring(0, 8)}... | Leaderboard: ${leaderboardType}`);
        console.log('─'.repeat(80));

        const topEntries = chartEntries.slice(0, 10); // Show top 10
        for (const entry of topEntries) {
          const grade = entry.data?.grade || '?';
          console.log(`Rank ${entry.rank.toString().padStart(2)}: ${entry.userAlias.padEnd(20)} | ` + `Score: ${entry.score.toFixed(2)} | Grade: ${grade}`);
        }

        // Check for ties
        const ties = new Map<number, typeof entries>();
        for (const entry of chartEntries) {
          const scoreKey = entry.score;
          if (!ties.has(scoreKey)) {
            ties.set(scoreKey, []);
          }
          ties.get(scoreKey)!.push(entry);
        }

        const tiedScores = Array.from(ties.entries()).filter(([, users]) => users.length > 1);
        if (tiedScores.length > 0) {
          console.log(`\n✓ Found ${tiedScores.length} tied score(s) on this chart:`);
          for (const [score, users] of tiedScores) {
            const ranks = [...new Set(users.map((u) => u.rank))];
            console.log(`  Score ${score.toFixed(2)}: ${users.length} users with rank(s) ${ranks.join(', ')}`);
            if (ranks.length > 1) {
              console.log('  ⚠️  WARNING: Tied scores have different ranks!');
            }
          }
        }

        console.log('\n');
        break; // Just show first chart
      }
    }

    console.log('Test complete!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testRanking();
