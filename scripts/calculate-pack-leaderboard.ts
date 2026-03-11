/**
 * Calculate Pack Leaderboards
 *
 * Computes overall pack leaderboards for a given pack ID.
 * Produces a matrix of 9 leaderboards: 3 difficulty slots × 3 scoring systems.
 *
 * Usage:
 *   npx tsx scripts/calculate-pack-leaderboard.ts <packId> [outputPath]
 *
 * Examples:
 *   npx tsx scripts/calculate-pack-leaderboard.ts 42
 *   npx tsx scripts/calculate-pack-leaderboard.ts 42 ./output/pack-42-leaderboards.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '../api/prisma/generated/client';
import { calculatePackLeaderboards, PACK_LEADERBOARD_DIFFICULTIES, SCORING_SYSTEM_KEYS } from '../api/src/utils/pack-leaderboard';

const prisma = new PrismaClient();

(async () => {
  const packIdArg = process.argv[2];
  if (!packIdArg) {
    console.error('Usage: npx tsx scripts/calculate-pack-leaderboard.ts <packId> [outputPath]');
    process.exit(1);
  }

  const packId = parseInt(packIdArg, 10);
  if (isNaN(packId)) {
    console.error(`Invalid pack ID: ${packIdArg}`);
    process.exit(1);
  }

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

    // Write JSON output
    const defaultOutputPath = path.join('output', `pack-${packId}-leaderboards.json`);
    const outputPath = process.argv[3] || defaultOutputPath;

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`JSON written to ${outputPath}`);
  } catch (error) {
    console.error('Error calculating pack leaderboards:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
