#!/usr/bin/env tsx
/**
 * Recalculate a single play's global leaderboard entries by play id.
 *
 * Clears the play's existing PlayLeaderboard rows for every global leaderboard
 * (ITG, EX, HardEX, ITG Rate Eligible, EX Rate Eligible) and reprocesses it from
 * scratch, so it ends up correctly present/absent on each based on current eligibility
 * rules. Does not touch event-specific leaderboards (e.g. Blue Shift).
 *
 * Usage:
 *   npx tsx scripts/recalculate-play.ts <playId> [additionalPlayIds...]
 *
 * Examples:
 *   npx tsx scripts/recalculate-play.ts 12345
 *   npx tsx scripts/recalculate-play.ts 12345 12346 12347
 */

import { PrismaClient } from '../api/prisma/generated/client';
import { S3Client } from '@aws-sdk/client-s3';
import { processSinglePlay } from '../api/src/utils/play-processor';
import { ALL_GLOBAL_LEADERBOARDS } from '../api/src/utils/leaderboard';

const prisma = new PrismaClient();
const s3Client = new S3Client();

async function recalculatePlay(playId: number): Promise<void> {
  const play = await prisma.play.findUnique({ where: { id: playId } });
  if (!play) {
    console.error(`Play ${playId} not found, skipping...`);
    return;
  }

  const { count } = await prisma.playLeaderboard.deleteMany({
    where: { playId, leaderboardId: { in: ALL_GLOBAL_LEADERBOARDS } },
  });
  console.log(`Cleared ${count} existing global leaderboard entries for play ${playId}`);

  await processSinglePlay(play, prisma, s3Client);

  const entries = await prisma.playLeaderboard.findMany({
    where: { playId, leaderboardId: { in: ALL_GLOBAL_LEADERBOARDS } },
    include: { leaderboard: { select: { id: true, type: true } } },
  });
  if (entries.length === 0) {
    console.log(`Play ${playId} is not eligible for any global leaderboard.`);
  } else {
    console.log(`Play ${playId} is now on: ${entries.map((e) => `${e.leaderboard.type} (id ${e.leaderboard.id})`).join(', ')}`);
  }
}

(async () => {
  const playIds = process.argv.slice(2).map((arg) => parseInt(arg, 10));

  if (playIds.length === 0 || playIds.some((id) => Number.isNaN(id))) {
    console.error('Usage: npx tsx scripts/recalculate-play.ts <playId> [additionalPlayIds...]');
    process.exit(1);
  }

  try {
    for (const playId of playIds) {
      await recalculatePlay(playId);
    }
  } catch (error) {
    console.error('Error recalculating play(s):', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
