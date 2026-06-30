/**
 * Calculate Pack Leaderboards
 *
 * Computes overall pack leaderboards for a given pack ID.
 * Produces a matrix of 9 leaderboards: 3 difficulty slots × 3 scoring systems.
 *
 * Usage:
 *   npx tsx scripts/calculate-pack-leaderboard.ts <packId> [outputPath] [--user <userId>]
 *
 * Examples:
 *   npx tsx scripts/calculate-pack-leaderboard.ts 42
 *   npx tsx scripts/calculate-pack-leaderboard.ts 42 ./output/pack-42-leaderboards.json
 *   npx tsx scripts/calculate-pack-leaderboard.ts 42 --user abc-123
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '../api/prisma/generated/client';
import { calculatePackLeaderboards, PACK_LEADERBOARD_DIFFICULTIES, SCORING_SYSTEM_KEYS } from '../api/src/utils/pack-leaderboard';

const prisma = new PrismaClient();

async function printUserChartBreakdown(packId: number, userId: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Per-chart breakdown for user ${userId}`);
  console.log('='.repeat(60));

  // Fetch all charts in the pack with their CMOD flag
  const simfileCharts = await prisma.simfileChart.findMany({
    where: {
      simfile: { packId },
      difficulty: { in: ['medium', 'hard', 'challenge'] },
    },
    select: { chartHash: true, difficulty: true, cmodIneligible: true },
    orderBy: { difficulty: 'asc' },
  });

  // Dedupe by chartHash+difficulty
  const seen = new Set<string>();
  const charts = simfileCharts.filter((sc) => {
    const key = `${sc.chartHash}:${sc.difficulty}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Fetch user's best play per chart across all leaderboard IDs, with modifiers
  const rows = await prisma.$queryRaw<
    Array<{
      chartHash: string;
      leaderboardId: number;
      score: number;
      speedType: string | null;
      playId: number;
    }>
  >`
    SELECT DISTINCT ON (p."chartHash", pl."leaderboardId")
      p."chartHash"                           AS "chartHash",
      pl."leaderboardId"                      AS "leaderboardId",
      (pl.data->>'score')::double precision   AS score,
      (p.modifiers->'speed'->>'type')         AS "speedType",
      p.id                                    AS "playId"
    FROM "PlayLeaderboard" pl
    JOIN "Play" p ON pl."playId" = p.id
    WHERE p."userId" = ${userId}
      AND p."chartHash" = ANY(${charts.map((c) => c.chartHash)})
    ORDER BY p."chartHash", pl."leaderboardId", pl."sortKey" DESC
  `;

  // Index rows by chartHash+leaderboardId
  const rowIndex = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    rowIndex.set(`${row.chartHash}:${row.leaderboardId}`, row);
  }

  const leaderboardIds: Record<string, number> = { HardEX: 4, EX: 2, ITG: 3 };

  for (const diff of ['medium', 'hard', 'challenge'] as const) {
    const diffCharts = charts.filter((c) => c.difficulty === diff);
    if (diffCharts.length === 0) continue;
    console.log(`\n--- ${diff} ---`);

    for (const sc of diffCharts) {
      const flag = sc.cmodIneligible ? '[CMOD-INELIGIBLE]' : '              ';
      console.log(`  ${sc.chartHash}  ${flag}`);

      for (const [system, lbId] of Object.entries(leaderboardIds)) {
        const row = rowIndex.get(`${sc.chartHash}:${lbId}`);
        if (!row) {
          console.log(`    ${system.padEnd(8)} no score`);
          continue;
        }
        const excluded = sc.cmodIneligible && row.speedType === 'C';
        const status = excluded ? 'EXCLUDED (CMOD)' : 'included';
        console.log(`    ${system.padEnd(8)} score=${row.score.toFixed(2).padStart(6)}  speedType=${(row.speedType ?? 'null').padEnd(4)}  ${status}`);
      }
    }
  }
}

(async () => {
  const args = process.argv.slice(2);
  const packIdArg = args[0];
  if (!packIdArg) {
    console.error('Usage: npx tsx scripts/calculate-pack-leaderboard.ts <packId> [outputPath] [--user <userId>]');
    process.exit(1);
  }

  const packId = parseInt(packIdArg, 10);
  if (isNaN(packId)) {
    console.error(`Invalid pack ID: ${packIdArg}`);
    process.exit(1);
  }

  const userFlagIdx = args.indexOf('--user');
  const debugUserId = userFlagIdx !== -1 ? args[userFlagIdx + 1] : null;
  const outputPath = args.find((a) => !a.startsWith('--') && a !== packIdArg && a !== debugUserId) ?? null;

  try {
    console.log(`Calculating pack leaderboards for pack ${packId}...\n`);

    const result = await calculatePackLeaderboards(prisma, packId);

    // Print summary to console
    console.log(`Pack: ${result.packName} (ID: ${result.packId})`);
    console.log(`Generated at: ${result.generatedAt}`);
    console.log(`Unique users across all leaderboards: ${Object.keys(result.users).length}\n`);

    for (const difficulty of PACK_LEADERBOARD_DIFFICULTIES) {
      for (const system of SCORING_SYSTEM_KEYS) {
        const lb = result.leaderboards[difficulty]?.[system];
        if (!lb) continue;

        console.log(`--- ${difficulty} / ${system} (${lb.totalParticipants} participants) ---`);

        const top = lb.rankings.slice(0, 5);
        for (const entry of top) {
          const user = result.users[entry.userId];
          console.log(
            `  #${entry.rank}  ${(user?.alias ?? entry.userId).padEnd(24)} ${entry.totalScore.toFixed(2).padStart(10)}  (${entry.chartsPlayed} charts)`,
          );
        }
        if (lb.totalParticipants > 5) {
          console.log(`  ... and ${lb.totalParticipants - 5} more`);
        }
        console.log();
      }
    }

    if (debugUserId) {
      await printUserChartBreakdown(packId, debugUserId);
    }

    if (outputPath) {
      const resolvedOutputPath = path.resolve(outputPath);
      const outputDir = path.dirname(resolvedOutputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(resolvedOutputPath, JSON.stringify(result, null, 2));
      console.log(`\nJSON written to ${resolvedOutputPath}`);
    }
  } catch (error) {
    console.error('Error calculating pack leaderboards:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
