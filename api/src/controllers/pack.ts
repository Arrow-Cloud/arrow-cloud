import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient, Prisma } from '../../prisma/generated/client';
import { ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { z } from 'zod';
import { assetS3UrlToCloudFrontUrl, toCfVariantSet, S3_BUCKET_ASSETS } from '../utils/s3';
import { respond } from '../utils/responses';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client();
import { resolveChartBanner } from '../utils/chart-banner';
import { GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID, GLOBAL_HARD_EX_LEADERBOARD_ID } from '../utils/leaderboard';
import { ELIGIBLE_PACK_IDS } from '../utils/pack-leaderboard';

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
  eligibleOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

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

    const { page, limit, search, eligibleOnly, orderBy, orderDirection } = validatedQuery;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};
    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive', // Case-insensitive search
      };
    }
    if (eligibleOnly) {
      where.id = { in: ELIGIBLE_PACK_IDS };
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
 * Load pack leaderboard JSON from S3, or return null if it doesn't exist.
 */
async function loadPackLeaderboard(packId: number): Promise<Record<string, unknown> | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET_ASSETS,
        Key: `json/pack-leaderboards/${packId}.json`,
      }),
    );
    if (!response.Body) return null;
    const body = await response.Body.transformToString();
    return JSON.parse(body);
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    console.error(`Error loading pack leaderboard for pack ${packId}:`, err);
    return null;
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

    const [pack, recentPlaysRaw, packLeaderboard] = await Promise.all([
      getPackFromDb(packId, prisma),
      getRecentPlays(packId, prisma, 1, 5),
      loadPackLeaderboard(packId),
    ]);

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
      packLeaderboard: packLeaderboard || undefined,
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error getting pack:', error);

    return respond(500, { error: 'Internal server error' });
  }
}

/**
 * Get all chart scores for one or more players in a pack
 * GET /v1/pack/{packId}/player-scores?userId=...&userId=...
 */
export async function getPackPlayerScores(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    if (!event.routeParameters?.packId) {
      return respond(400, { error: 'Pack ID is required' });
    }

    const packId = parseInt(event.routeParameters.packId, 10);
    if (isNaN(packId)) {
      return respond(400, { error: 'Invalid pack ID' });
    }

    // userIds passed as comma-separated: ?userIds=id1,id2,...
    const rawUserIds = event.queryStringParameters?.userIds ?? '';
    const userIds = rawUserIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (userIds.length === 0) {
      return respond(400, { error: 'At least one userId is required' });
    }

    // Verify pack exists
    const pack = await prisma.pack.findUnique({ where: { id: packId }, select: { id: true } });
    if (!pack) {
      return respond(404, { error: 'Pack not found' });
    }

    // Fetch simfiles in the pack with their medium/hard/challenge charts
    const simfilesRaw = await prisma.simfile.findMany({
      where: { packId },
      select: {
        id: true,
        title: true,
        artist: true,
        bannerUrl: true,
        mdBannerUrl: true,
        smBannerUrl: true,
        bannerVariants: true,
        charts: {
          where: { difficulty: { in: ['medium', 'hard', 'challenge'] } },
          select: {
            difficulty: true,
            chartHash: true,
            meter: true,
            stepsType: true,
          },
        },
      },
      orderBy: { title: 'asc' },
    });

    // Build simfiles structure
    const simfiles = simfilesRaw.map((sf) => {
      const charts: Record<string, { hash: string; meter: number | null; stepsType: string | null }> = {};
      for (const sc of sf.charts) {
        if (sc.difficulty) {
          charts[sc.difficulty] = {
            hash: sc.chartHash,
            meter: sc.meter ?? null,
            stepsType: sc.stepsType ?? null,
          };
        }
      }
      return {
        simfileId: sf.id,
        title: sf.title,
        artist: sf.artist,
        bannerUrl: sf.bannerUrl ? assetS3UrlToCloudFrontUrl(sf.bannerUrl) : null,
        mdBannerUrl: sf.mdBannerUrl ? assetS3UrlToCloudFrontUrl(sf.mdBannerUrl) : null,
        smBannerUrl: sf.smBannerUrl ? assetS3UrlToCloudFrontUrl(sf.smBannerUrl) : null,
        bannerVariants: toCfVariantSet(sf.bannerVariants) || undefined,
        charts,
      };
    });

    // Collect all chart hashes from this pack
    const allChartHashes = simfilesRaw.flatMap((sf) => sf.charts.map((sc) => sc.chartHash));

    // Leaderboard ID → key mapping
    const LEADERBOARD_KEY_MAP: Record<number, 'ITG' | 'EX' | 'HardEX'> = {
      [GLOBAL_MONEY_LEADERBOARD_ID]: 'ITG',
      [GLOBAL_EX_LEADERBOARD_ID]: 'EX',
      [GLOBAL_HARD_EX_LEADERBOARD_ID]: 'HardEX',
    };

    // Perfect grade override per leaderboard key
    const PERFECT_GRADE: Record<string, string> = {
      ITG: 'quad',
      EX: 'quint',
      HardEX: 'hex',
    };

    const lbIds = [GLOBAL_MONEY_LEADERBOARD_ID, GLOBAL_EX_LEADERBOARD_ID, GLOBAL_HARD_EX_LEADERBOARD_ID];

    // Query best scores per user/chart/leaderboard
    const bestScores = await prisma.$queryRaw<
      Array<{
        userId: string;
        chartHash: string;
        leaderboardId: number;
        data: any;
      }>
    >(
      Prisma.sql`
        SELECT DISTINCT ON (p."userId", p."chartHash", pl."leaderboardId")
          p."userId",
          p."chartHash",
          pl."leaderboardId",
          pl.data
        FROM "Play" p
        JOIN "PlayLeaderboard" pl ON pl."playId" = p.id
        WHERE p."userId"::text IN (${Prisma.join(userIds.map((id) => Prisma.sql`${id}`))})
          AND p."chartHash" IN (${Prisma.join(allChartHashes.map((h) => Prisma.sql`${h}`))})
          AND pl."leaderboardId" IN (${Prisma.join(lbIds.map((id) => Prisma.sql`${id}`))})
        ORDER BY p."userId", p."chartHash", pl."leaderboardId", pl."sortKey" DESC
      `,
    );

    // Build per-player score maps
    type ScoreEntry = { score: string; grade: string };
    type ChartScores = { EX?: ScoreEntry; ITG?: ScoreEntry; HardEX?: ScoreEntry };
    const playerScoreMap: Record<string, Record<string, ChartScores>> = {};

    for (const row of bestScores) {
      const lbKey = LEADERBOARD_KEY_MAP[row.leaderboardId];
      if (!lbKey) continue;
      const userId = row.userId;
      if (!playerScoreMap[userId]) playerScoreMap[userId] = {};
      if (!playerScoreMap[userId][row.chartHash]) playerScoreMap[userId][row.chartHash] = {};

      const data = row.data as { score?: string; grade?: string } | null;
      const score = data?.score ?? '';
      let grade = data?.grade ?? '';

      // Perfect score override
      if (data?.score === '100.00') {
        grade = PERFECT_GRADE[lbKey];
      }

      playerScoreMap[userId][row.chartHash][lbKey] = { score, grade };
    }

    // Fetch user info
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, alias: true, profileImageUrl: true },
    });

    const players = users.map((u) => ({
      userId: u.id,
      alias: u.alias,
      profileImageUrl: u.profileImageUrl ? assetS3UrlToCloudFrontUrl(u.profileImageUrl) : null,
      scores: playerScoreMap[u.id] ?? {},
    }));

    return respond(200, { simfiles, players });
  } catch (error) {
    console.error('Error getting pack player scores:', error);
    return respond(500, { error: 'Internal server error' });
  }
}
