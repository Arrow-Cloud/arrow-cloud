import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { toCfVariantSet } from '../utils/s3';
import { respond } from '../utils/responses';
import {
  PHASE_1_HASHES,
  PHASE_2_HASHES,
  PHASE_3_HASHES,
  getActiveBlueShiftPhase,
  getBlueShiftPackDownloadUrl,
  BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID,
} from '../utils/events/blueshift';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const S3_BUCKET_ASSETS = process.env.S3_BUCKET_ASSETS || 'arrow-cloud-assets';

interface PhaseConfig {
  phaseNumber: 1 | 2 | 3;
  hashes: string[];
  leaderboardIds: number[];
  s3Key: string;
  leaderboardNamePrefix: string;
  announcement: string;
}

/**
 * Get configuration for a specific phase
 */
function getPhaseConfig(phaseNumber: 1 | 2 | 3): PhaseConfig {
  switch (phaseNumber) {
    case 1:
      return {
        phaseNumber: 1,
        hashes: PHASE_1_HASHES,
        leaderboardIds: [BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID],
        s3Key: 'json/blueshift-overall-rankings-(phase-1).json',
        leaderboardNamePrefix: 'Blue Shift',
        announcement: 'Blue Shift Phase 1 is now live! Submit scores and climb the leaderboards.',
      };
    case 2:
      return {
        phaseNumber: 2,
        hashes: PHASE_2_HASHES,
        leaderboardIds: [BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID],
        s3Key: 'json/blueshift-overall-rankings-(phase-2).json',
        leaderboardNamePrefix: 'Blue Shift',
        announcement: "Blue Shift Phase 2 is live! We've shifted things easier! Dial in your timing!",
      };
    case 3:
      return {
        phaseNumber: 3,
        hashes: PHASE_3_HASHES,
        leaderboardIds: [BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID],
        s3Key: 'json/blueshift-overall-rankings-(phase-3).json',
        leaderboardNamePrefix: 'Blue Shift',
        announcement: "Blue Shift Phase 3 - Oops all Stamtech! We've shifted everything harder, and longer, submit your scores before Feb 6, 12:00PM UTC!",
      };
  }
}

// Interface for overall leaderboard data structure
interface OverallLeaderboardEntry {
  rank: number;
  userAlias: string;
  userId: string;
  totalPoints: number;
  chartsPlayed: number;
}

interface OverallLeaderboardData {
  generatedAt: string;
  pointsSystem: {
    maxPoints: number;
    decayRate: number;
    description: string;
  };
  leaderboards: {
    [key: string]: {
      totalParticipants: number;
      rankings: OverallLeaderboardEntry[];
    };
  };
}

/**
 * Fetch overall leaderboard data from S3
 */
async function fetchOverallLeaderboard(s3Key: string): Promise<OverallLeaderboardData | null> {
  try {
    const s3Client = new S3Client();

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_ASSETS,
      Key: s3Key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      console.error('No data found in S3 object for overall leaderboard');
      return null;
    }

    const bodyString = await response.Body.transformToString();
    return JSON.parse(bodyString) as OverallLeaderboardData;
  } catch (error) {
    console.error('Error fetching overall leaderboard from S3:', error);
    return null;
  }
}

/**
 * Get all phases' overall leaderboard data
 */
export async function blueShiftAllPhases(event: ExtendedAPIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const limitParam = event.queryStringParameters?.limit;
    const limit = !limitParam || limitParam === 'null' || limitParam === 'undefined' ? null : parseInt(limitParam, 10);

    console.log(`Blue Shift All Phases API: Fetching all phases with limit=${limit}`);

    // Fetch all available phases in parallel
    const [phase1Data, phase2Data, phase3Data] = await Promise.all([
      fetchOverallLeaderboard('json/blueshift-overall-rankings-(phase-1).json'),
      fetchOverallLeaderboard('json/blueshift-overall-rankings-(phase-2).json'),
      fetchOverallLeaderboard('json/blueshift-overall-rankings-(phase-3).json'),
    ]);

    const phases = [];

    if (phase1Data) {
      phases.push({
        phaseNumber: 1,
        generatedAt: phase1Data.generatedAt,
        pointsSystem: phase1Data.pointsSystem,
        leaderboards: {
          hardEX: phase1Data.leaderboards.hardEX
            ? {
                totalParticipants: phase1Data.leaderboards.hardEX.totalParticipants,
                rankings: limit ? phase1Data.leaderboards.hardEX.rankings.slice(0, limit) : phase1Data.leaderboards.hardEX.rankings,
              }
            : { totalParticipants: 0, rankings: [] },
          EX: phase1Data.leaderboards.EX
            ? {
                totalParticipants: phase1Data.leaderboards.EX.totalParticipants,
                rankings: limit ? phase1Data.leaderboards.EX.rankings.slice(0, limit) : phase1Data.leaderboards.EX.rankings,
              }
            : { totalParticipants: 0, rankings: [] },
          money: phase1Data.leaderboards.money
            ? {
                totalParticipants: phase1Data.leaderboards.money.totalParticipants,
                rankings: limit ? phase1Data.leaderboards.money.rankings.slice(0, limit) : phase1Data.leaderboards.money.rankings,
              }
            : { totalParticipants: 0, rankings: [] },
        },
      });
    }

    if (phase2Data) {
      phases.push({
        phaseNumber: 2,
        generatedAt: phase2Data.generatedAt,
        pointsSystem: phase2Data.pointsSystem,
        leaderboards: {
          hardEX: phase2Data.leaderboards.hardEX
            ? {
                totalParticipants: phase2Data.leaderboards.hardEX.totalParticipants,
                rankings: limit ? phase2Data.leaderboards.hardEX.rankings.slice(0, limit) : phase2Data.leaderboards.hardEX.rankings,
              }
            : { totalParticipants: 0, rankings: [] },
          EX: phase2Data.leaderboards.EX
            ? {
                totalParticipants: phase2Data.leaderboards.EX.totalParticipants,
                rankings: limit ? phase2Data.leaderboards.EX.rankings.slice(0, limit) : phase2Data.leaderboards.EX.rankings,
              }
            : { totalParticipants: 0, rankings: [] },
          money: phase2Data.leaderboards.money
            ? {
                totalParticipants: phase2Data.leaderboards.money.totalParticipants,
                rankings: limit ? phase2Data.leaderboards.money.rankings.slice(0, limit) : phase2Data.leaderboards.money.rankings,
              }
            : { totalParticipants: 0, rankings: [] },
        },
      });
    }

    if (phase3Data) {
      phases.push({
        phaseNumber: 3,
        generatedAt: phase3Data.generatedAt,
        pointsSystem: phase3Data.pointsSystem,
        leaderboards: {
          hardEX: phase3Data.leaderboards.hardEX
            ? {
                totalParticipants: phase3Data.leaderboards.hardEX.totalParticipants,
                rankings: limit ? phase3Data.leaderboards.hardEX.rankings.slice(0, limit) : phase3Data.leaderboards.hardEX.rankings,
              }
            : { totalParticipants: 0, rankings: [] },
          EX: phase3Data.leaderboards.EX
            ? {
                totalParticipants: phase3Data.leaderboards.EX.totalParticipants,
                rankings: limit ? phase3Data.leaderboards.EX.rankings.slice(0, limit) : phase3Data.leaderboards.EX.rankings,
              }
            : { totalParticipants: 0, rankings: [] },
          money: phase3Data.leaderboards.money
            ? {
                totalParticipants: phase3Data.leaderboards.money.totalParticipants,
                rankings: limit ? phase3Data.leaderboards.money.rankings.slice(0, limit) : phase3Data.leaderboards.money.rankings,
              }
            : { totalParticipants: 0, rankings: [] },
        },
      });
    }

    return respond(200, { phases });
  } catch (error) {
    console.error('Error getting Blue Shift all phases data:', error);
    return respond(500, { error: 'Internal server error' });
  }
}

/**
 * Blue Shift homepage data
 */
export async function blueShift(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    // Parse limit parameter for leaderboard rankings
    // If not provided, return full data (no limit)
    // If explicitly set to 'null', return full data
    // Otherwise parse as integer
    const limitParam = event.queryStringParameters?.limit;
    const limit = !limitParam || limitParam === 'null' || limitParam === 'undefined' ? null : parseInt(limitParam, 10);

    // Determine which phase is currently active (defaults to Phase 1 for preview)
    const now = new Date();
    const activePhaseNumber = getActiveBlueShiftPhase(now);
    const phaseConfig = getPhaseConfig(activePhaseNumber);

    console.log(`Blue Shift API: Serving Phase ${activePhaseNumber} data with limit=${limit}`);

    // Fetch data in parallel for better performance
    const [recentPlays, eventCharts, overallLeaderboard] = await Promise.all([
      // Recent plays query
      prisma.play.findMany({
        take: 5,

        orderBy: {
          createdAt: 'desc',
        },

        where: {
          PlayLeaderboard: {
            some: {
              leaderboardId: {
                in: phaseConfig.leaderboardIds,
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
                  type: true,
                },
              },
            },
            where: {
              leaderboardId: {
                in: phaseConfig.leaderboardIds,
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
      }),

      // Event charts query
      prisma.chart.findMany({
        where: {
          hash: {
            in: phaseConfig.hashes,
          },
        },
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
        orderBy: [
          {
            songName: 'asc',
          },
        ],
      }),

      // Overall leaderboard from S3
      fetchOverallLeaderboard(phaseConfig.s3Key),
    ]);

    const response = {
      announcement: phaseConfig.announcement,
      announcementDownloadUrl: getBlueShiftPackDownloadUrl(activePhaseNumber),
      recentPlays: recentPlays.map((recentPlay) => ({
        playId: recentPlay.id,
        chart: {
          hash: recentPlay.chart.hash,
          bannerVariants: toCfVariantSet(recentPlay.chart.simfiles[0]?.simfile.bannerVariants) || undefined,
          title: recentPlay.chart.simfiles[0]?.simfile.title || recentPlay.chart.songName,
          artist: recentPlay.chart.simfiles[0]?.simfile.artist || recentPlay.chart.artist,
          stepsType: recentPlay.chart.stepsType,
          difficulty: recentPlay.chart.difficulty,
          meter: recentPlay.chart.meter,
        },
        user: {
          id: recentPlay.user.id,
          alias: recentPlay.user.alias,
        },
        leaderboards: recentPlay.PlayLeaderboard.map((playLeaderboard) => ({
          leaderboard: playLeaderboard.leaderboard.type,
          data: playLeaderboard.data,
        })),
        createdAt: recentPlay.createdAt,
      })),
      charts: eventCharts.map((chart) => ({
        hash: chart.hash,
        bannerVariants: toCfVariantSet(chart.simfiles[0]?.simfile.bannerVariants) || undefined,
        title: chart.simfiles[0]?.simfile.title || chart.songName,
        artist: chart.simfiles[0]?.simfile.artist || chart.artist,
        stepsType: chart.stepsType,
        difficulty: chart.difficulty,
        meter: chart.meter,
        credit: chart.simfiles[0]?.credit || null,
      })),
      overallLeaderboard: overallLeaderboard
        ? {
            generatedAt: overallLeaderboard.generatedAt,
            pointsSystem: overallLeaderboard.pointsSystem,
            leaderboards: {
              hardEX: overallLeaderboard.leaderboards.hardEX
                ? {
                    totalParticipants: overallLeaderboard.leaderboards.hardEX.totalParticipants,
                    rankings: limit ? overallLeaderboard.leaderboards.hardEX.rankings.slice(0, limit) : overallLeaderboard.leaderboards.hardEX.rankings,
                  }
                : {
                    totalParticipants: 0,
                    rankings: [],
                  },
              EX: overallLeaderboard.leaderboards.EX
                ? {
                    totalParticipants: overallLeaderboard.leaderboards.EX.totalParticipants,
                    rankings: limit ? overallLeaderboard.leaderboards.EX.rankings.slice(0, limit) : overallLeaderboard.leaderboards.EX.rankings,
                  }
                : {
                    totalParticipants: 0,
                    rankings: [],
                  },
              money: overallLeaderboard.leaderboards.money
                ? {
                    totalParticipants: overallLeaderboard.leaderboards.money.totalParticipants,
                    rankings: limit ? overallLeaderboard.leaderboards.money.rankings.slice(0, limit) : overallLeaderboard.leaderboards.money.rankings,
                  }
                : {
                    totalParticipants: 0,
                    rankings: [],
                  },
            },
          }
        : null,
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error getting Blue Shift data:', error);

    return respond(500, { error: 'Internal server error' });
  }
}
