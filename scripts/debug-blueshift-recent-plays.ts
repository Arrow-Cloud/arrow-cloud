import { PrismaClient } from '../api/prisma/generated/client';
import {
  BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID,
} from '../api/src/utils/events/blueshift';

const prisma = new PrismaClient();

async function main() {
  console.log('Testing Blue Shift recent plays query...\n');

  const leaderboardIds = [BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID];

  console.log('Leaderboard IDs:', leaderboardIds);
  console.log('');

  try {
    const recentPlays = await prisma.play.findMany({
      take: 10,

      orderBy: {
        createdAt: 'desc',
      },

      where: {
        PlayLeaderboard: {
          some: {
            leaderboardId: {
              in: leaderboardIds,
            },
          },
        },
      },

      select: {
        id: true,
        createdAt: true,
        PlayLeaderboard: {
          select: {
            data: true,
            leaderboard: {
              select: {
                id: true,
                type: true,
              },
            },
          },
          where: {
            leaderboardId: {
              in: leaderboardIds,
            },
          },
        },
        user: {
          select: {
            id: true,
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
                    mdBannerUrl: true,
                    smBannerUrl: true,
                    bannerVariants: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    console.log(`Found ${recentPlays.length} recent plays:\n`);

    for (const play of recentPlays) {
      console.log('---');
      console.log(`Play ID: ${play.id}`);
      console.log(`User: ${play.user.alias} (${play.user.id})`);
      console.log(`Chart: ${play.chart.songName || play.chart.simfiles[0]?.simfile.title} (${play.chart.hash})`);
      console.log(`Created: ${play.createdAt.toISOString()}`);
      console.log('Leaderboards:');
      for (const pl of play.PlayLeaderboard) {
        console.log(`  - ${pl.leaderboard.type} (ID: ${pl.leaderboard.id})`);
      }
      console.log('');
    }

    if (recentPlays.length === 0) {
      console.log('No plays found. Checking if there are any plays with these leaderboard IDs...\n');

      const playLeaderboardCount = await prisma.playLeaderboard.count({
        where: {
          leaderboardId: {
            in: leaderboardIds,
          },
        },
      });

      console.log(`Total PlayLeaderboard entries with these IDs: ${playLeaderboardCount}`);

      if (playLeaderboardCount > 0) {
        console.log('\nSample PlayLeaderboard entries:');
        const sampleEntries = await prisma.playLeaderboard.findMany({
          take: 5,
          where: {
            leaderboardId: {
              in: leaderboardIds,
            },
          },
          select: {
            playId: true,
            leaderboardId: true,
            leaderboard: {
              select: {
                type: true,
              },
            },
            play: {
              select: {
                id: true,
                createdAt: true,
                userId: true,
                chartHash: true,
              },
            },
          },
        });

        for (const entry of sampleEntries) {
          console.log(
            `  Play: ${entry.playId}, Leaderboard: ${entry.leaderboard.type} (${entry.leaderboardId}), Created: ${entry.play.createdAt.toISOString()}`,
          );
        }
      }
    }
  } catch (error) {
    console.error('Error running query:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
