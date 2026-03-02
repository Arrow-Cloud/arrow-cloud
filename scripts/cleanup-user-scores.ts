import { PrismaClient } from '../api/prisma/generated/client';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';

/**
 * Cleanup all score submissions (plays + related leaderboard rows + S3 objects) for a single user.
 *
 * Usage:
 *   tsx scripts/cleanup-user-scores.ts <userId> [--dry-run]
 *
 * Environment:
 *   Relies on DATABASE_URL for Prisma and AWS credentials for S3 (standard SDK resolution).
 */

const prisma = new PrismaClient();
const s3 = new S3Client();

interface Args {
  userId: string;
  dryRun: boolean;
}

function parseArgs(): Args {
  const [, , ...rest] = process.argv;
  if (rest.length === 0) {
    console.error('Error: userId argument required.');
    console.error('Usage: tsx scripts/cleanup-user-scores.ts <userId> [--dry-run]');
    process.exit(1);
  }
  const userId = rest[0];
  const dryRun = rest.includes('--dry-run');
  return { userId, dryRun };
}

async function deleteS3ForPlay(rawTimingDataUrl: string): Promise<void> {
  try {
    const url = new URL(rawTimingDataUrl);
    const bucket = url.hostname;
    const key = url.pathname.replace(/^\//, '');
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    console.warn(`S3 delete failed for ${rawTimingDataUrl}:`, (e as Error).message);
  }
}

async function main() {
  const { userId, dryRun } = parseArgs();
  console.log(`Cleaning up scores for user: ${userId}${dryRun ? ' (dry-run)' : ''}`);

  // Verify user exists (optional but helpful)
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, alias: true } });
  if (!user) {
    console.error('User not found. Aborting.');
    process.exit(1);
  }
  console.log(`User found: alias='${user.alias}' (id=${user.id})`);

  const plays = await prisma.play.findMany({ where: { userId }, select: { id: true, rawTimingDataUrl: true } });
  if (plays.length === 0) {
    console.log('No plays found for this user. Nothing to do.');
    return;
  }
  console.log(`Found ${plays.length} plays for user.`);

  const playIds = plays.map((p) => p.id);
  console.log(`Will delete ${playIds.length} PlayLeaderboard rows (if any).`);

  if (dryRun) {
    console.log('Dry-run mode: showing planned actions:');
    console.log('- Delete playLeaderboard rows where playId IN', playIds.slice(0, 10), playIds.length > 10 ? '...' : '');
    console.log('- Delete S3 objects for each play with rawTimingDataUrl');
    console.log('- Delete play rows for user');
    return;
  }

  const plResult = await prisma.playLeaderboard.deleteMany({ where: { playId: { in: playIds } } });
  console.log(`Deleted ${plResult.count} PlayLeaderboard rows.`);

  console.log('Deleting S3 score objects referenced by plays (best effort)...');
  const limit = pLimit(20);
  const s3Deletes = plays.filter((p) => !!p.rawTimingDataUrl).map((p) => limit(() => deleteS3ForPlay(p.rawTimingDataUrl)));
  await Promise.allSettled(s3Deletes);

  console.log('Deleting Play rows...');
  const playResult = await prisma.play.deleteMany({ where: { id: { in: playIds } } });
  console.log(`Deleted ${playResult.count} Play rows.`);

  console.log('Cleanup complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
