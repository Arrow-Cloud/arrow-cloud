import { PrismaClient } from '../api/prisma/generated/client';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';

const prisma = new PrismaClient();
const s3 = new S3Client();

// Identify seeded users by alias prefix; override with SEED_ALIAS_PREFIX if needed
const SEED_ALIAS_PREFIX = process.env.SEED_ALIAS_PREFIX || 'seed_user_';

async function deleteS3ForPlay(rawTimingDataUrl: string): Promise<void> {
  try {
    const url = new URL(rawTimingDataUrl);
    const bucket = url.hostname;
    const key = url.pathname.replace(/^\//, '');
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    // Swallow errors; we still want to clean DB
    console.warn(`S3 delete failed for ${rawTimingDataUrl}:`, (e as Error).message);
  }
}

async function main() {
  console.log(`Cleaning scores for users with alias prefix: '${SEED_ALIAS_PREFIX}'`);

  // Find seeded users
  const users = await prisma.user.findMany({
    where: { alias: { startsWith: SEED_ALIAS_PREFIX } },
    select: { id: true, alias: true },
  });

  if (users.length === 0) {
    console.log('No seeded users found. Nothing to do.');
    return;
  }

  const userIds = users.map((u) => u.id);
  console.log(`Found ${users.length} users. Fetching plays...`);

  // Load plays for those users
  const plays = await prisma.play.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, rawTimingDataUrl: true },
  });

  if (plays.length === 0) {
    console.log('No plays found for seeded users. Nothing to delete.');
    return;
  }

  const playIds = plays.map((p) => p.id);
  console.log(`Deleting PlayLeaderboard entries for ${playIds.length} plays...`);
  const plResult = await prisma.playLeaderboard.deleteMany({ where: { playId: { in: playIds } } });
  console.log(`Deleted ${plResult.count} PlayLeaderboard rows.`);

  // Delete S3 score objects referenced by plays
  console.log('Deleting S3 score objects referenced by plays...');
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
