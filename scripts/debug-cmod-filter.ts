/**
 * Debug CMOD filtering for a specific user + chart hash.
 *
 * Usage:
 *   npx tsx scripts/debug-cmod-filter.ts <userId> <chartHash>
 */
import { PrismaClient } from '../api/prisma/generated/client';

const prisma = new PrismaClient();

async function main() {
  const userId = process.argv[2];
  const chartHash = process.argv[3];

  if (!userId || !chartHash) {
    console.error('Usage: npx tsx scripts/debug-cmod-filter.ts <userId> <chartHash>');
    process.exit(1);
  }

  // 1. Is the chart flagged as CMOD-ineligible?
  const charts = await prisma.simfileChart.findMany({
    where: { chartHash },
    select: { id: true, cmodIneligible: true, difficulty: true, simfileId: true },
  });
  console.log('=== SimfileChart rows for hash ===');
  console.log(JSON.stringify(charts, null, 2));

  // 2. User's plays on this chart with their full modifiers
  const plays = await prisma.play.findMany({
    where: { userId, chartHash },
    orderBy: { createdAt: 'desc' },
    select: { id: true, modifiers: true, createdAt: true },
  });
  console.log('\n=== User plays on this chart (with modifiers) ===');
  console.log(JSON.stringify(plays, null, 2));

  // 3. PlayLeaderboard entries for those plays
  for (const play of plays) {
    const entries = await prisma.playLeaderboard.findMany({
      where: { playId: play.id },
      select: { leaderboardId: true, sortKey: true, data: true },
    });
    console.log(`\n=== PlayLeaderboard entries for play ${play.id} (${play.createdAt.toISOString()}) ===`);
    console.log(JSON.stringify(entries, null, 2));
  }

  // 4. Raw SQL: what does the CMOD filter clause actually see?
  const rawCheck = await prisma.$queryRaw<Array<{ chartHash: string; speedType: string | null; wouldExclude: boolean }>>`
    SELECT
      p."chartHash",
      (p.modifiers->'speed'->>'type') AS "speedType",
      (
        (p."chartHash" = ANY(ARRAY[${chartHash}]::text[]))
        AND (p.modifiers->'speed'->>'type') IS NOT DISTINCT FROM 'C'
      ) AS "wouldExclude"
    FROM "Play" p
    WHERE p."userId" = ${userId}
      AND p."chartHash" = ${chartHash}
    ORDER BY p."createdAt" DESC
  `;
  console.log('\n=== CMOD filter evaluation (wouldExclude = true means it should be filtered out) ===');
  console.log(JSON.stringify(rawCheck, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
