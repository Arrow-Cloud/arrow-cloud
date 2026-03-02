import { PrismaClient } from '../api/prisma/generated/client';
import { z } from 'zod';

const prisma = new PrismaClient({
  log: ['query'],
});

const LeaderboardEntrySchema = z.object({
  rank: z.bigint().transform((val) => Number(val)),
  data: z.any(), // JSON data from the leaderboard
  userAlias: z.string(),
  leaderboardType: z.string(),
});

type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

// usage: npx tsx scripts/get-leaderboard.ts {hash}
(async () => {
  const hash = process.argv[2];

  const chart = await prisma.chart.findFirst({
    where: {
      hash,
    },
  });
  if (!chart) {
    console.error(`Chart with hash ${hash} not found`);
    return;
  }

  // Fetch top 5 scores for each leaderboard type
  const leaderboardTypes = ['EX', 'ITG', 'HardEX'];

  for (const type of leaderboardTypes) {
    const rawResults = await prisma.$queryRaw`
      SELECT
        ROW_NUMBER() OVER (ORDER BY pl."sortKey" DESC) as rank,
        pl.data,
        u.alias as "userAlias",
        l.type as "leaderboardType",
        p."createdAt" as "date"
      FROM "PlayLeaderboard" pl
      JOIN "Play" p ON pl."playId" = p.id
      JOIN "User" u ON p."userId" = u.id
      JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
      WHERE p."chartHash" = ${hash}
        AND l.type = ${type}
      ORDER BY pl."sortKey" DESC
      LIMIT 5
    `;

    const playLeaderboards: LeaderboardEntry[] = z.array(LeaderboardEntrySchema).parse(rawResults);

    console.log(`${type} Leaderboard:`, playLeaderboards);
  }
})();
