import { PrismaClient } from '../api/prisma/generated/client';

const prisma = new PrismaClient();

// usage: npx tsx scripts/send-test-notification.ts {userId}
(async () => {
  const userId = process.argv[2];
  if (!userId) {
    console.error('Usage: npx tsx scripts/send-test-notification.ts {userId}');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, alias: true } });
  if (!user) {
    console.error(`User not found: ${userId}`);
    process.exit(1);
  }

  const latestPlay = await prisma.play.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      chart: { select: { songName: true, difficulty: true, meter: true } },
    },
  });

  if (!latestPlay) {
    console.error(`User ${user.alias} has no plays`);
    process.exit(1);
  }

  const songName = latestPlay.chart.songName ?? 'Unknown Song';
  const difficulty = latestPlay.chart.difficulty ?? '';
  const meter = latestPlay.chart.meter != null ? ` ${latestPlay.chart.meter}` : '';

  const notification = await prisma.notification.create({
    data: {
      userId,
      type: 'test',
      title: 'Check out your latest play!',
      body: `${songName} ${difficulty}${meter}`,
      channel: 'in_app',
      data: { route: `/play/${latestPlay.id}` },
    },
  });

  console.log(`Sent notification #${notification.id} to ${user.alias} → /play/${latestPlay.id} (${songName})`);
  await prisma.$disconnect();
})();
