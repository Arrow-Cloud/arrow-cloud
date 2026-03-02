import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { z } from 'zod';
import { assetS3UrlToCloudFrontUrl, toCfVariantSet } from '../utils/s3';
import { respond } from '../utils/responses';
import { resolveChartBanner } from '../utils/chart-banner';
import { GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID, GLOBAL_HARD_EX_LEADERBOARD_ID } from '../utils/leaderboard';

// Query parameter schemas for validation
const ListPacksQuerySchema = z.object({
  // Pagination
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => Math.max(1, parseInt(val, 10) || 1)),
  limit: z
    .string()
    .optional()
    .default('25')
    .transform((val) => Math.min(100, Math.max(1, parseInt(val, 10) || 25))),

  // Filtering
  search: z.string().optional(), // Search in pack name

  // Ordering
  orderBy: z.enum(['name', 'createdAt', 'updatedAt', 'simfileCount', 'popularity']).optional().default('popularity'),
  orderDirection: z.enum(['asc', 'desc']).optional().default('desc'),
});

const PackRecentPlaysQuerySchema = z.object({
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
    .transform((val) => Math.min(100, Math.max(1, parseInt(val, 10) || 5))),

  // Filtering
  search: z.string().optional(), // Search in title, artist, or player alias
});

/**
 * List packs with pagination, filtering, and ordering
 * GET /packs
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 25, max: 100)
 * - search: Search term for pack name
 * - orderBy: Field to order by (name, createdAt, updatedAt, simfileCount, popularity)
 * - orderDirection: Order direction (asc, desc) (default: desc for popularity, asc for others)
 */
export async function listPacks(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    // Parse and validate query parameters
    const queryParams = event.queryStringParameters || {};
    const validatedQuery = ListPacksQuerySchema.parse(queryParams);

    const { page, limit, search, orderBy, orderDirection } = validatedQuery;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};
    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive', // Case-insensitive search
      };
    }

    // Build orderBy clause
    let prismaOrderBy: any;
    switch (orderBy) {
      case 'name':
        prismaOrderBy = { name: orderDirection };
        break;
      case 'createdAt':
        prismaOrderBy = { createdAt: orderDirection };
        break;
      case 'updatedAt':
        prismaOrderBy = { updatedAt: orderDirection };
        break;
      case 'simfileCount':
        // For ordering by simfile count, we need to use a different approach
        // This will be handled in the query with a subquery
        prismaOrderBy = { simfiles: { _count: orderDirection } };
        break;
      case 'popularity':
        prismaOrderBy = { popularity: orderDirection };
        break;
      default:
        prismaOrderBy = { popularity: 'desc' };
    }

    // Execute queries in parallel for better performance
    const [packs, totalCount, maxPopularityResult] = await Promise.all([
      prisma.pack.findMany({
        where,
        orderBy: prismaOrderBy,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              simfiles: true,
            },
          },
        },
      }),
      prisma.pack.count({ where }),
      prisma.pack.findFirst({
        where,
        select: { popularity: true },
        orderBy: { popularity: 'desc' },
      }),
    ]);

    const maxPopularity = maxPopularityResult?.popularity || 0;

    // Transform data for response
    const transformedPacks = packs.map((pack) => ({
      id: pack.id,
      name: pack.name,
      bannerUrl: assetS3UrlToCloudFrontUrl(pack.bannerUrl),
      mdBannerUrl: assetS3UrlToCloudFrontUrl(pack.mdBannerUrl),
      smBannerUrl: assetS3UrlToCloudFrontUrl(pack.smBannerUrl),
      bannerVariants: toCfVariantSet(pack.bannerVariants) || undefined,
      simfileCount: pack._count.simfiles,
      popularity: pack.popularity || 0,
      popularityUpdatedAt: pack.popularityUpdatedAt?.toISOString() || null,
      createdAt: pack.createdAt.toISOString(),
      updatedAt: pack.updatedAt.toISOString(),
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const response = {
      data: transformedPacks,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
        maxPopularity,
      },
      filters: {
        search,
        orderBy,
        orderDirection,
      },
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error listing packs:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return respond(400, { error: 'Invalid query parameters', details: error.errors });
    }

    // Handle other errors
    return respond(500, { error: 'Internal server error' });
  }
}

const getPackFromDb = (packId: number, prisma: PrismaClient) => {
  return prisma.pack.findUnique({
    where: { id: packId },
    include: {
      _count: {
        select: {
          simfiles: true,
        },
      },
    },
  });
};

const getRecentPlays = (packId: number, prisma: PrismaClient, page: number = 1, limit: number = 5, search?: string) => {
  const skip = (page - 1) * limit;

  // Build search condition for title, artist, or player alias
  const searchConditions = search
    ? {
        OR: [
          {
            chart: {
              simfiles: {
                some: {
                  simfile: {
                    title: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              },
            },
          },
          {
            chart: {
              simfiles: {
                some: {
                  simfile: {
                    artist: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              },
            },
          },
          {
            user: {
              alias: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
          },
        ],
      }
    : {};

  const whereClause = {
    AND: [
      {
        chart: {
          simfiles: {
            some: {
              simfile: {
                pack: {
                  id: packId,
                },
              },
            },
          },
        },
      },
      {
        PlayLeaderboard: {
          some: {
            leaderboardId: {
              in: [GLOBAL_HARD_EX_LEADERBOARD_ID, GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID],
            },
          },
        },
      },
      searchConditions,
    ],
  };

  return prisma.play.findMany({
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
  });
};

/**
 * Get pack recent plays with pagination and search
 * GET /v1/pack/{packId}/recent-plays
 */
export async function getPackRecentPlays(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    if (!event.routeParameters?.packId) {
      return respond(400, { error: 'Pack ID is required' });
    }

    const packId = parseInt(event.routeParameters.packId, 10);
    if (isNaN(packId)) {
      return respond(400, { error: 'Invalid pack ID' });
    }

    // Parse and validate query parameters
    const queryParams = event.queryStringParameters || {};
    const validatedQuery = PackRecentPlaysQuerySchema.parse(queryParams);

    const { page, limit, search } = validatedQuery;

    // Build where clause for counting
    const searchConditions = search
      ? {
          OR: [
            {
              chart: {
                simfiles: {
                  some: {
                    simfile: {
                      title: {
                        contains: search,
                        mode: 'insensitive' as const,
                      },
                    },
                  },
                },
              },
            },
            {
              chart: {
                simfiles: {
                  some: {
                    simfile: {
                      artist: {
                        contains: search,
                        mode: 'insensitive' as const,
                      },
                    },
                  },
                },
              },
            },
            {
              user: {
                alias: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            },
          ],
        }
      : {};

    const whereClause = {
      AND: [
        {
          chart: {
            simfiles: {
              some: {
                simfile: {
                  pack: {
                    id: packId,
                  },
                },
              },
            },
          },
        },
        {
          PlayLeaderboard: {
            some: {
              leaderboardId: {
                in: [GLOBAL_HARD_EX_LEADERBOARD_ID, GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID],
              },
            },
          },
        },
        searchConditions,
      ],
    };

    // Execute queries in parallel
    const [recentPlaysRaw, totalCount] = await Promise.all([getRecentPlays(packId, prisma, page, limit, search), prisma.play.count({ where: whereClause })]);

    const recentPlays = recentPlaysRaw.map((recentPlay) => {
      const chartBanner = resolveChartBanner(recentPlay.chart.simfiles);
      return {
        playId: recentPlay.id,
        chart: {
          hash: recentPlay.chart.hash,
          ...chartBanner,
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
        leaderboards: recentPlay.PlayLeaderboard.map((pl) => ({ leaderboard: pl.leaderboard.type, data: pl.data })),
        createdAt: recentPlay.createdAt,
      };
    });

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return respond(200, {
      data: recentPlays,
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      filters: {
        search: search || null,
      },
    });
  } catch (error) {
    console.error('Error getting pack recent plays:', error);

    if (error instanceof z.ZodError) {
      return respond(400, { error: 'Invalid query parameters', details: error.errors });
    }

    return respond(500, { error: 'Internal server error' });
  }
}

/**
 * Get a single pack by ID
 * GET /v1/packs/{packId}
 */
export async function getPack(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    if (!event.routeParameters?.packId) {
      return respond(400, { error: 'Pack ID is required' });
    }

    const packId = parseInt(event.routeParameters?.packId, 10);

    const [pack, recentPlaysRaw] = await Promise.all([getPackFromDb(packId, prisma), getRecentPlays(packId, prisma, 1, 5)]);

    if (!pack) {
      return respond(404, { error: 'Pack not found' });
    }

    const response = {
      id: pack.id,
      name: pack.name,
      bannerUrl: pack.bannerUrl ? assetS3UrlToCloudFrontUrl(pack.bannerUrl) : null,
      mdBannerUrl: pack.mdBannerUrl ? assetS3UrlToCloudFrontUrl(pack.mdBannerUrl) : null,
      smBannerUrl: pack.smBannerUrl ? assetS3UrlToCloudFrontUrl(pack.smBannerUrl) : null,
      bannerVariants: toCfVariantSet(pack.bannerVariants) || undefined,
      simfileCount: pack._count.simfiles,
      recentPlays: recentPlaysRaw.map((recentPlay) => {
        const chartBanner = resolveChartBanner(recentPlay.chart.simfiles);
        return {
          playId: recentPlay.id,
          chart: {
            hash: recentPlay.chart.hash,
            ...chartBanner,
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
          leaderboards: recentPlay.PlayLeaderboard.map((pl) => ({ leaderboard: pl.leaderboard.type, data: pl.data })),
          createdAt: recentPlay.createdAt,
        };
      }),
      createdAt: pack.createdAt.toISOString(),
      updatedAt: pack.updatedAt.toISOString(),
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error getting pack:', error);

    return respond(500, { error: 'Internal server error' });
  }
}
