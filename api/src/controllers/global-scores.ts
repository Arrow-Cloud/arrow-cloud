import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { OptionalAuthEvent } from '../utils/types';
import { z } from 'zod';
import { assetS3UrlToCloudFrontUrl } from '../utils/s3';
import { respond } from '../utils/responses';
import { GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID, GLOBAL_HARD_EX_LEADERBOARD_ID } from '../utils/leaderboard';
import { resolveChartBanner } from '../utils/chart-banner';

const GlobalRecentScoresQuerySchema = z.object({
  // Pagination
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => Math.max(1, parseInt(val, 10) || 1)),
  limit: z
    .string()
    .optional()
    .default('5')
    .transform((val) => Math.min(50, Math.max(1, parseInt(val, 10) || 5))),
  // Filter to only show rivals
  rivalsOnly: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

/**
 * Get global recent scores with pagination
 * GET /scores/recent
 */
export async function getGlobalRecentScores(event: OptionalAuthEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    // Parse and validate query parameters
    const queryParams = event.queryStringParameters || {};
    const validatedQuery = GlobalRecentScoresQuerySchema.parse(queryParams);

    const { page, limit, rivalsOnly } = validatedQuery;
    const skip = (page - 1) * limit;

    // Get rival user IDs if rivalsOnly is requested and user is authenticated
    let rivalUserIds: string[] = [];
    if (rivalsOnly && event.user?.id) {
      const rivals = await prisma.userRival.findMany({
        where: { userId: event.user.id },
        select: { rivalUserId: true },
      });
      rivalUserIds = rivals.map((r) => r.rivalUserId);
    }

    // Base where clause - plays with global leaderboard entries
    const whereClause: any = {
      PlayLeaderboard: {
        some: {
          leaderboardId: {
            in: [GLOBAL_HARD_EX_LEADERBOARD_ID, GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID],
          },
        },
      },
    };

    // Add rival filter if requested
    if (rivalsOnly && rivalUserIds.length > 0) {
      whereClause.userId = { in: rivalUserIds };
    } else if (rivalsOnly) {
      // User has no rivals, return empty result
      return respond(200, {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }

    // Execute queries in parallel
    const [recentPlaysRaw, totalCount] = await Promise.all([
      prisma.play.findMany({
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
                in: [GLOBAL_HARD_EX_LEADERBOARD_ID, GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID],
              },
            },
          },
          user: {
            select: {
              id: true,
              alias: true,
              profileImageUrl: true,
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
                orderBy: { createdAt: 'asc' },
                select: {
                  createdAt: true,
                  simfile: {
                    select: {
                      title: true,
                      subtitle: true,
                      artist: true,
                      bannerUrl: true,
                      mdBannerUrl: true,
                      smBannerUrl: true,
                      bannerVariants: true,
                      pack: {
                        select: {
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
          },
        },
        where: whereClause,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.play.count({ where: whereClause }),
    ]);

    const recentPlays = recentPlaysRaw.map((recentPlay) => {
      const chartBanner = resolveChartBanner(recentPlay.chart.simfiles);
      const primarySimfile = recentPlay.chart.simfiles[0]?.simfile;

      return {
        playId: recentPlay.id,
        chart: {
          hash: recentPlay.chart.hash,
          ...chartBanner,
          title: primarySimfile?.title || recentPlay.chart.songName,
          artist: primarySimfile?.artist || recentPlay.chart.artist,
          stepsType: recentPlay.chart.stepsType,
          difficulty: recentPlay.chart.difficulty,
          meter: recentPlay.chart.meter,
        },
        user: {
          id: recentPlay.user.id,
          alias: recentPlay.user.alias,
          profileImageUrl: recentPlay.user.profileImageUrl ? assetS3UrlToCloudFrontUrl(recentPlay.user.profileImageUrl) : null,
        },
        leaderboards: recentPlay.PlayLeaderboard.map((pl) => ({ leaderboard: pl.leaderboard.type, data: pl.data })),
        createdAt: recentPlay.createdAt,
      };
    });

    // Cap total pages at 10 as per requirement
    const maxPages = 10;
    const actualTotalPages = Math.ceil(totalCount / limit);
    const totalPages = Math.min(actualTotalPages, maxPages);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return respond(200, {
      data: recentPlays,
      meta: {
        total: Math.min(totalCount, maxPages * limit), // Cap total to 5 pages worth
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    });
  } catch (error) {
    console.error('Error getting global recent scores:', error);

    if (error instanceof z.ZodError) {
      return respond(400, { error: 'Invalid query parameters', details: error.errors });
    }

    return respond(500, { error: 'Internal server error' });
  }
}
