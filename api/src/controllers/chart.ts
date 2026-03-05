import type { AuthenticatedRouteHandler, AuthenticatedEvent, ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { PrismaClient, User } from '../../prisma/generated';
import { PlaySubmission, validatePlaySubmission } from '../utils/scoring';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { emptyResponse, internalServerErrorResponse, respond } from '../utils/responses';
import { APIGatewayProxyResult } from 'aws-lambda';
import { assetS3UrlToCloudFrontUrl, toCfVariantSet } from '../utils/s3';
import { z } from 'zod';
import { processSinglePlay } from '../utils/play-processor';
import { publishScoreSubmissionEvent, EVENT_TYPES } from '../utils/events';
import { GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID, GLOBAL_HARD_EX_LEADERBOARD_ID } from '../utils/leaderboard';
import { EventRegistry, EventLeaderboardResponse } from '../utils/events/base';
import { EventLeaderboardService } from '../services/eventLeaderboards';
import { notifyWidgetRefresh } from '../utils/websocket';
import { resolveChartBanner } from '../utils/chart-banner';
import { parseLocalDateToUTC } from '../utils/date';

// Query parameter schemas for validation
const ListChartsQuerySchema = z.object({
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
  search: z.string().optional(), // Search in song name or artist
  stepsType: z.string().optional(), // Filter by steps type (e.g., 'dance-single', 'dance-double')
  difficulty: z.string().optional(), // Filter by difficulty
  packId: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) || undefined : undefined)), // Filter by pack ID

  // Ordering
  orderBy: z.enum(['songName', 'artist', 'createdAt', 'updatedAt', 'rating', 'length', 'meter']).optional().default('songName'),
  orderDirection: z.enum(['asc', 'desc']).optional().default('asc'),
});

const ChartRecentPlaysQuerySchema = z.object({
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
  search: z.string().optional(), // Search in player alias
  userIds: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').filter(Boolean) : undefined)), // Filter by user IDs (comma-separated)
});

/**
 * List charts with pagination, filtering, and ordering
 * GET /charts
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 25, max: 100)
 * - search: Search term for song name or artist
 * - stepsType: Filter by steps type
 * - difficulty: Filter by difficulty
 * - packId: Filter by pack ID
 * - orderBy: Field to order by (songName, artist, createdAt, updatedAt, rating, length, meter)
 * - orderDirection: Order direction (asc, desc)
 */
export async function listCharts(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    // Parse and validate query parameters
    const queryParams = event.queryStringParameters || {};
    const validatedQuery = ListChartsQuerySchema.parse(queryParams);

    const { page, limit, search, stepsType, difficulty, packId, orderBy, orderDirection } = validatedQuery;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};

    if (search) {
      where.OR = [
        {
          songName: {
            contains: search,
            mode: 'insensitive', // Case-insensitive search
          },
        },
        {
          artist: {
            contains: search,
            mode: 'insensitive', // Case-insensitive search
          },
        },
      ];
    }

    if (stepsType) {
      where.stepsType = stepsType;
    }

    if (difficulty) {
      where.difficulty = difficulty;
    }

    if (packId) {
      where.simfiles = {
        some: {
          simfile: {
            packId: packId,
          },
        },
      };
    }

    // Build orderBy clause
    let prismaOrderBy: any;
    switch (orderBy) {
      case 'songName':
        prismaOrderBy = { songName: orderDirection };
        break;
      case 'artist':
        prismaOrderBy = { artist: orderDirection };
        break;
      case 'createdAt':
        prismaOrderBy = { createdAt: orderDirection };
        break;
      case 'updatedAt':
        prismaOrderBy = { updatedAt: orderDirection };
        break;
      case 'rating':
        prismaOrderBy = { rating: orderDirection };
        break;
      case 'length':
        prismaOrderBy = { length: orderDirection };
        break;
      case 'meter':
        prismaOrderBy = { meter: orderDirection };
        break;
      default:
        prismaOrderBy = { songName: 'asc' };
    }

    // Execute queries in parallel for better performance
    const [charts, totalCount] = await Promise.all([
      prisma.chart.findMany({
        where,
        orderBy: prismaOrderBy,
        skip,
        take: limit,
        select: {
          hash: true,
          songName: true,
          artist: true,
          rating: true,
          length: true,
          stepartist: true,
          stepsType: true,
          difficulty: true,
          description: true,
          meter: true,
          chartName: true,
          credit: true,
          createdAt: true,
          updatedAt: true,
          simfiles: {
            orderBy: { createdAt: 'asc' },
            select: {
              chartName: true,
              stepsType: true,
              description: true,
              difficulty: true,
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
                  pack: {
                    select: {
                      id: true,
                      name: true,
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
      prisma.chart.count({ where }),
    ]);

    // Transform data for response
    const transformedCharts = charts.map((chart) => {
      const chartBanner = resolveChartBanner(chart.simfiles);
      return {
        hash: chart.hash,
        songName: chart.songName,
        artist: chart.artist,
        rating: chart.rating,
        length: chart.length,
        stepartist: chart.stepartist,
        stepsType: chart.stepsType,
        difficulty: chart.difficulty,
        description: chart.description,
        meter: chart.meter,
        chartName: chart.chartName,
        credit: chart.credit,
        // Banner image fields (align with chart detail endpoint fields subset)
        ...chartBanner,
        simfiles: chart.simfiles.map((simfileChart) => ({
          title: simfileChart.simfile.title,
          subtitle: simfileChart.simfile.subtitle,
          artist: simfileChart.simfile.artist,
          pack: simfileChart.simfile.pack
            ? {
                id: simfileChart.simfile.pack.id,
                name: simfileChart.simfile.pack.name,
                bannerUrl: simfileChart.simfile.pack.bannerUrl ? assetS3UrlToCloudFrontUrl(simfileChart.simfile.pack.bannerUrl) : null,
                mdBannerUrl: simfileChart.simfile.pack.mdBannerUrl ? assetS3UrlToCloudFrontUrl(simfileChart.simfile.pack.mdBannerUrl) : null,
                smBannerUrl: simfileChart.simfile.pack.smBannerUrl ? assetS3UrlToCloudFrontUrl(simfileChart.simfile.pack.smBannerUrl) : null,
                bannerVariants: toCfVariantSet(simfileChart.simfile.pack.bannerVariants) || undefined,
              }
            : null,
        })),
        createdAt: chart.createdAt.toISOString(),
        updatedAt: chart.updatedAt.toISOString(),
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const response = {
      data: transformedCharts,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      filters: {
        search,
        stepsType,
        difficulty,
        packId,
        orderBy,
        orderDirection,
      },
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error listing charts:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return respond(400, { error: 'Invalid query parameters', details: error.errors });
    }

    // Handle other errors
    return respond(500, { error: 'Internal server error' });
  }
}

const getChartFromDb = (chartHash: string, prisma: PrismaClient) => {
  return prisma.chart.findUnique({
    where: { hash: chartHash },
    select: {
      hash: true,
      songName: true,
      artist: true,
      rating: true,
      length: true,
      stepartist: true,
      stepsType: true,
      difficulty: true,
      description: true,
      meter: true,
      chartName: true,
      credit: true,
      radarValues: true,
      chartBpms: true,
      createdAt: true,
      updatedAt: true,
      simfiles: {
        orderBy: { createdAt: 'asc' },
        select: {
          chartName: true,
          stepsType: true,
          description: true,
          difficulty: true,
          meter: true,
          credit: true,
          simfile: {
            select: {
              title: true,
              subtitle: true,
              artist: true,
              genre: true,
              credit: true,
              bannerUrl: true,
              mdBannerUrl: true,
              smBannerUrl: true,
              bannerVariants: true,
              backgroundUrl: true,
              jacketUrl: true,
              pack: {
                select: {
                  id: true,
                  name: true,
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
};

const getRecentPlaysForChart = (chartHash: string, prisma: PrismaClient, page: number = 1, limit: number = 5, search?: string, userIds?: string[]) => {
  const skip = (page - 1) * limit;

  // Build search condition for player alias
  const searchConditions = search
    ? {
        user: {
          alias: {
            contains: search,
            mode: 'insensitive' as const,
          },
        },
      }
    : {};

  // Build userIds filter condition (filter by multiple user IDs)
  const userIdsCondition = userIds && userIds.length > 0 ? { userId: { in: userIds } } : {};

  const whereClause = {
    AND: [
      {
        chartHash: chartHash,
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
      userIdsCondition,
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
            orderBy: { createdAt: 'asc' },
            select: {
              createdAt: true,
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
 * Get a single chart by hash
 * GET /charts/{chartHash}
 */
export async function getChart(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    if (!event.routeParameters?.chartHash) {
      return respond(400, { error: 'Chart hash is required' });
    }

    const chartHash = event.routeParameters.chartHash;

    const [chart, recentPlaysRaw] = await Promise.all([getChartFromDb(chartHash, prisma), getRecentPlaysForChart(chartHash, prisma, 1, 5)]);

    if (!chart) {
      return respond(404, { error: 'Chart not found' });
    }

    const chartBanner = resolveChartBanner(chart.simfiles);

    const response = {
      hash: chart.hash,
      songName: chart.songName,
      artist: chart.artist,
      rating: chart.rating,
      length: chart.length,
      stepartist: chart.stepartist,
      stepsType: chart.stepsType,
      difficulty: chart.difficulty,
      description: chart.description,
      meter: chart.meter,
      chartName: chart.chartName,
      credit: chart.credit,
      radarValues: chart.radarValues,
      chartBpms: chart.chartBpms,
      // Add banner image support
      ...chartBanner,
      simfiles: chart.simfiles.map((simfileChart) => ({
        chartName: simfileChart.chartName,
        stepsType: simfileChart.stepsType,
        description: simfileChart.description,
        difficulty: simfileChart.difficulty,
        meter: simfileChart.meter,
        credit: simfileChart.credit,
        simfile: {
          title: simfileChart.simfile.title,
          subtitle: simfileChart.simfile.subtitle,
          artist: simfileChart.simfile.artist,
          genre: simfileChart.simfile.genre,
          credit: simfileChart.simfile.credit,
          bannerUrl: simfileChart.simfile.bannerUrl ? assetS3UrlToCloudFrontUrl(simfileChart.simfile.bannerUrl) : null,
          mdBannerUrl: simfileChart.simfile.mdBannerUrl ? assetS3UrlToCloudFrontUrl(simfileChart.simfile.mdBannerUrl) : null,
          smBannerUrl: simfileChart.simfile.smBannerUrl ? assetS3UrlToCloudFrontUrl(simfileChart.simfile.smBannerUrl) : null,
          bannerVariants: toCfVariantSet(simfileChart.simfile.bannerVariants) || undefined,
          backgroundUrl: simfileChart.simfile.backgroundUrl ? assetS3UrlToCloudFrontUrl(simfileChart.simfile.backgroundUrl) : null,
          jacketUrl: simfileChart.simfile.jacketUrl ? assetS3UrlToCloudFrontUrl(simfileChart.simfile.jacketUrl) : null,
          pack: {
            id: simfileChart.simfile.pack.id,
            name: simfileChart.simfile.pack.name,
            bannerUrl: simfileChart.simfile.pack.bannerUrl ? assetS3UrlToCloudFrontUrl(simfileChart.simfile.pack.bannerUrl) : null,
            mdBannerUrl: simfileChart.simfile.pack.mdBannerUrl ? assetS3UrlToCloudFrontUrl(simfileChart.simfile.pack.mdBannerUrl) : null,
            smBannerUrl: simfileChart.simfile.pack.smBannerUrl ? assetS3UrlToCloudFrontUrl(simfileChart.simfile.pack.smBannerUrl) : null,
            bannerVariants: toCfVariantSet(simfileChart.simfile.pack.bannerVariants) || undefined,
          },
        },
      })),
      recentPlays: recentPlaysRaw.map((recentPlay) => {
        const recentPlayBanner = resolveChartBanner(recentPlay.chart.simfiles);
        const primarySimfile = recentPlay.chart.simfiles[0]?.simfile;

        return {
          playId: recentPlay.id,
          chart: {
            hash: recentPlay.chart.hash,
            bannerUrl: recentPlayBanner.bannerUrl,
            mdBannerUrl: recentPlayBanner.mdBannerUrl,
            smBannerUrl: recentPlayBanner.smBannerUrl,
            bannerVariants: recentPlayBanner.bannerVariants,
            title: primarySimfile?.title || recentPlay.chart.songName,
            artist: primarySimfile?.artist || recentPlay.chart.artist,
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
      createdAt: chart.createdAt.toISOString(),
      updatedAt: chart.updatedAt.toISOString(),
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error getting chart:', error);

    return respond(500, { error: 'Internal server error' });
  }
}

/**
 * Get chart recent plays with pagination and search
 * GET /chart/{chartHash}/recent-plays
 */
export async function getChartRecentPlays(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    if (!event.routeParameters?.chartHash) {
      return respond(400, { error: 'Chart hash is required' });
    }

    const chartHash = event.routeParameters.chartHash;

    // Parse and validate query parameters
    const queryParams = event.queryStringParameters || {};
    const validatedQuery = ChartRecentPlaysQuerySchema.parse(queryParams);

    const { page, limit, search, userIds } = validatedQuery;

    // Build search condition for counting
    const searchConditions = search
      ? {
          user: {
            alias: {
              contains: search,
              mode: 'insensitive' as const,
            },
          },
        }
      : {};

    // Build userIds filter condition
    const userIdsCondition = userIds && userIds.length > 0 ? { userId: { in: userIds } } : {};

    const whereClause = {
      AND: [
        {
          chartHash: chartHash,
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
        userIdsCondition,
      ],
    };

    // Execute queries in parallel
    const [recentPlaysRaw, totalCount] = await Promise.all([
      getRecentPlaysForChart(chartHash, prisma, page, limit, search, userIds),
      prisma.play.count({ where: whereClause }),
    ]);

    const recentPlays = recentPlaysRaw.map((recentPlay) => {
      const recentPlayBanner = resolveChartBanner(recentPlay.chart.simfiles);
      const primarySimfile = recentPlay.chart.simfiles[0]?.simfile;

      return {
        playId: recentPlay.id,
        chart: {
          hash: recentPlay.chart.hash,
          bannerUrl: recentPlayBanner.bannerUrl,
          mdBannerUrl: recentPlayBanner.mdBannerUrl,
          smBannerUrl: recentPlayBanner.smBannerUrl,
          bannerVariants: recentPlayBanner.bannerVariants,
          title: primarySimfile?.title || recentPlay.chart.songName,
          artist: primarySimfile?.artist || recentPlay.chart.artist,
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
    console.error('Error getting chart recent plays:', error);

    if (error instanceof z.ZodError) {
      return respond(400, { error: 'Invalid query parameters', details: error.errors });
    }

    return respond(500, { error: 'Internal server error' });
  }
}

interface ScoreSubmissionEvent extends AuthenticatedEvent {
  user: User;
  routeParameters: { chartHash: string };
  body: string;
}

interface ScoreSubmissionResponse {
  success: true;
  eventLeaderboards?: EventLeaderboardResponse[];
}

const validateScoreSubmission = (event: AuthenticatedEvent): event is ScoreSubmissionEvent => {
  if (!event.user) {
    return false;
  }

  if (!event.routeParameters?.chartHash) {
    return false;
  }

  if (!event.body) {
    return false;
  }

  return true;
};

const s3Client: S3Client = new S3Client();
const BUCKET = 'arrow-cloud-scores';

export const scoreSubmission: AuthenticatedRouteHandler = async (event: AuthenticatedEvent, prisma: PrismaClient) => {
  if (validateScoreSubmission(event)) {
    const user = event.user;
    const hash = event.routeParameters.chartHash;
    console.log(`Received score submission request from user ${user.alias} for chartHash ${hash}`);

    let scoreSubmission: PlaySubmission;
    try {
      const parsedData = JSON.parse(event.body);
      scoreSubmission = validatePlaySubmission(parsedData);
    } catch (error) {
      console.error('Failed to parse or validate score submission:', error);
      return respond(400, { error: 'Invalid score submission' });
    }

    // Check if this chart belongs to any active events
    // (Event configs should be registered at application startup, not here)
    const activeEvents = EventRegistry.getEventsForChartAndUser(hash, user.id);
    console.log(`Found ${activeEvents.length} active events for chart ${hash}`);

    // Capture leaderboard snapshots before processing if needed for events
    const eventLeaderboardService = new EventLeaderboardService(prisma);
    const eventSnapshots = new Map();

    for (const eventConfig of activeEvents) {
      try {
        console.log(`Capturing snapshot for event ${eventConfig.name}`);
        const snapshot = await eventLeaderboardService.getLeaderboardSnapshot(hash, eventConfig.leaderboardIds, eventConfig);
        eventSnapshots.set(eventConfig.id, snapshot);
      } catch (error) {
        console.error(`Failed to capture snapshot for event ${eventConfig.name}:`, error);
        // Continue with other events, but this event won't have before/after data
      }
    }

    // Prepare S3 upload
    const path = `scores/${hash}/${user.id}/${Date.now()}.json`;
    const s3UploadCommand = new PutObjectCommand({
      Bucket: BUCKET,
      Key: path,
      Body: JSON.stringify(scoreSubmission),
      ContentType: 'application/json',
    });

    try {
      // Execute S3 upload and database operations in parallel
      const [, newPlay] = await Promise.all([
        // Upload to S3
        s3Client.send(s3UploadCommand),

        // Database transaction: ensure chart exists and create play
        prisma.$transaction(async (tx) => {
          // Check if chart exists, create if it doesn't
          const existingChart = await tx.chart.findUnique({
            where: { hash },
            select: { hash: true },
          });

          if (!existingChart) {
            await tx.chart.create({
              data: {
                hash,
                songName: scoreSubmission.songName,
                artist: scoreSubmission.artist,
                rating: typeof scoreSubmission.difficulty === 'string' ? parseInt(scoreSubmission.difficulty, 10) : scoreSubmission.difficulty,
                length: scoreSubmission.length,
                stepartist: scoreSubmission.stepartist,
              },
            });
          }

          // Create the play record
          // If the submission was pending, use the pendingDate as the timestamp
          // pendingDate arrives as local time (no TZ offset) so convert using the user's profile timezone
          const pendingTimestamp =
            scoreSubmission.wasPending && scoreSubmission.pendingDate ? parseLocalDateToUTC(scoreSubmission.pendingDate, user.timezone) : undefined;

          return tx.play.create({
            data: {
              userId: user.id,
              chartHash: hash,
              rawTimingDataUrl: `s3://${BUCKET}/${path}`,
              modifiers: scoreSubmission.modifiers as object,
              engineName: scoreSubmission._engineName,
              engineVersion: scoreSubmission._engineVersion,
              ...(pendingTimestamp && {
                createdAt: pendingTimestamp,
                updatedAt: pendingTimestamp,
              }),
            },
          });
        }),
      ]);

      // Send immediate WebSocket notification for this user's widgets
      const WEBSOCKET_API_URL = process.env.WEBSOCKET_API_URL;
      const CONNECTIONS_TABLE_NAME = process.env.CONNECTIONS_TABLE_NAME || 'arrow-cloud-websocket-connections';
      if (WEBSOCKET_API_URL) {
        try {
          await notifyWidgetRefresh(WEBSOCKET_API_URL, CONNECTIONS_TABLE_NAME, user.id, 'New score submitted');
          console.log(`[WebSocket] Sent refresh notification for user ${user.id}`);
        } catch (error) {
          console.error('[WebSocket] Failed to send refresh notification:', error);
          // Don't fail the request if WebSocket notification fails
        }
      }

      // Process the play for leaderboards (pass submission data to avoid S3 fetch)
      try {
        await processSinglePlay(newPlay, prisma, s3Client, scoreSubmission);
      } catch (error) {
        console.error('Failed to process play for leaderboards:', error);
        // Don't return an error response here - the play was created successfully,
        // we just failed to process leaderboards. This can be retried later.
      }

      // Publish score submission event to SNS
      try {
        await publishScoreSubmissionEvent({
          eventType: EVENT_TYPES.SCORE_SUBMITTED,
          timestamp: newPlay.createdAt.toISOString(),
          userId: user.id,
          chartHash: hash,
          play: {
            id: newPlay.id.toString(),
            rawTimingDataUrl: `s3://${BUCKET}/${path}`,
          },
        });
      } catch (error) {
        console.error('Failed to publish score submission event:', error);
        // Don't fail the request if event publication fails
      }

      // Calculate event leaderboards with deltas if this chart belongs to active events
      const response: ScoreSubmissionResponse = { success: true };

      if (activeEvents.length > 0) {
        const eventLeaderboards: EventLeaderboardResponse[] = [];

        // Load user's rivals and play count once to avoid redundant queries
        const [rivalRows, playCount] = await Promise.all([
          prisma.userRival.findMany({ where: { userId: user.id }, select: { rivalUserId: true } }),
          prisma.play.count({ where: { userId: user.id, chartHash: hash } }),
        ]);
        const rivalIds = rivalRows.map((r) => r.rivalUserId);

        for (const eventConfig of activeEvents) {
          try {
            const beforeSnapshot = eventSnapshots.get(eventConfig.id);
            const leaderboardsWithDeltas = await eventLeaderboardService.getEventLeaderboardsWithDeltas(hash, eventConfig, beforeSnapshot, user.id, rivalIds);
            // Let the event generate prioritized messages for this submission
            let messages: string[] = [];
            try {
              messages = await eventConfig.generateMessages(prisma, hash, user.id, beforeSnapshot || new Map(), leaderboardsWithDeltas, rivalIds, playCount);
            } catch (e) {
              console.error(`Failed to generate messages for event ${eventConfig.name}:`, e);
              messages = [];
            }

            eventLeaderboards.push({
              eventId: eventConfig.id,
              eventName: eventConfig.name,
              leaderboards: leaderboardsWithDeltas,
              messages,
            });

            console.log(`Calculated leaderboards for event ${eventConfig.name} with ${leaderboardsWithDeltas.length} leaderboard types`);
          } catch (error) {
            console.error(`Failed to calculate event leaderboards for ${eventConfig.name}:`, error);
            // Continue with other events, don't fail the whole request
          }
        }

        if (eventLeaderboards.length > 0) {
          response.eventLeaderboards = eventLeaderboards;
        }
      }

      // Return event leaderboards if available, otherwise empty response for backward compatibility
      if (response.eventLeaderboards && response.eventLeaderboards.length > 0) {
        return respond(200, response);
      } else {
        return emptyResponse();
      }
    } catch (error) {
      console.error('Failed to process score submission:', error);
      return internalServerErrorResponse({ error: 'Failed to process score submission' });
    }
  }

  return respond(400, { error: 'Invalid score submission format' });
};
