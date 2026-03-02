import { PrismaClient } from '../api/prisma/generated/client';

import util from 'util';
import { BLUE_SHIFT_EX_LEADERBOARD_ID, BLUE_SHIFT_MONEY_LEADERBOARD_ID, BLUE_SHIFT_SUPER_EX_LEADERBOARD_ID } from '../api/src/utils/leaderboard';

const prisma = new PrismaClient({
  log: ['query'],
});

// usage: npx tsx scripts/get-pack-recent-plays.ts {hash}
(async () => {
  const leaderBoards = [BLUE_SHIFT_SUPER_EX_LEADERBOARD_ID, BLUE_SHIFT_EX_LEADERBOARD_ID, BLUE_SHIFT_MONEY_LEADERBOARD_ID];

  const recentPlays = await prisma.play.findMany({
    orderBy: {
      createdAt: 'desc',
    },

    take: 5,

    where: {
      PlayLeaderboard: {
        some: {
          leaderboardId: {
            in: leaderBoards,
          },
        },
      },
    },

    select: {
      createdAt: true,
      PlayLeaderboard: {
        select: {
          data: true,
          leaderboard: {
            select: {
              type: true,
            },
          },
        },
        where: {
          leaderboardId: {
            in: leaderBoards,
          },
        },
      },
      user: {
        select: {
          alias: true,
        },
      },
      chart: {
        select: {
          hash: true,
          songName: true,
          artist: true,
          stepsType: true,
          difficulty: true,
          meter: true,

          simfiles: {
            select: {
              chartName: true,
              stepsType: true,
              description: true,
              meter: true,
              credit: true,

              simfile: {
                select: {
                  title: true,
                  subtitle: true,
                  artist: true,
                  bannerUrl: true,
                },
              },
            },
          },
        },
      },
    },
  });

  console.log(util.inspect(recentPlays, { depth: 999 }));
})();
