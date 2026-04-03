import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated';
import { ExtendedAPIGatewayProxyEvent, OptionalAuthEvent } from '../utils/types';
import { respond } from '../utils/responses';
import { assetS3UrlToCloudFrontUrl, toCfVariantSet } from '../utils/s3';
import { z } from 'zod';
import { resolveChartBanner } from '../utils/chart-banner';
import { countPerfectScores } from '../utils/stats-utils';

// Session gap threshold (2 hours in milliseconds) - used to determine if session is ongoing
const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

// Leaderboard IDs
const LEADERBOARD_EX = 2;
const LEADERBOARD_ITG = 3;
const LEADERBOARD_HARDEX = 4;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(5),
  pbOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  leaderboard: z.enum(['EX', 'ITG', 'HardEX']).optional(),
});

const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  rivalsOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

// Session summary for list views
interface SessionSummary {
  id: number;
  userId: string;
  userAlias: string;
  userProfileImageUrl: string | null;
  startedAt: string;
  endedAt: string;
  isOngoing: boolean;
  playCount: number;
  stepsHit: number;
}

interface SessionPlay {
  id: number;
  playedAt: string;
  modifiers: {
    visualDelay?: number;
    acceleration?: unknown[];
    appearance?: unknown[];
    effect?: unknown[];
    mini?: number;
    turn?: string;
    disabledWindows?: string;
    speed?: { value: number; type: string };
    perspective?: string;
    noteskin?: string;
  } | null;
  chart: {
    hash: string;
    title: string | null;
    artist: string | null;
    stepsType: string | null;
    difficulty: string | null;
    meter: number | null;
    packName: string | null;
    bannerUrl: string | null;
    mdBannerUrl: string | null;
    smBannerUrl: string | null;
    bannerVariants?: Record<string, unknown>;
  };
  leaderboards: Array<{
    type: string;
    score: string;
    grade: string | null;
    judgments: Record<string, number>;
    isPB: boolean;
    delta: number | null; // Score delta vs previous best (null if first play on chart)
  }>;
}

interface SessionDetails {
  id: number;
  userId: string;
  userAlias: string;
  userProfileImageUrl: string | null;
  startedAt: string;
  endedAt: string;
  isOngoing: boolean;
  durationMs: number;
  playCount: number;
  distinctCharts: number;
  stepsHit: number;
  quads: number;
  quints: number;
  hexes: number;
  difficultyDistribution: Array<{ meter: number; count: number }>;
  topPacks: Array<{
    packId: number;
    packName: string;
    chartCount: number;
    bannerUrl: string | null;
    mdBannerUrl: string | null;
    smBannerUrl: string | null;
    bannerVariants?: Record<string, unknown>;
  }>;
  plays: SessionPlay[];
  pagination: {
    page: number;
    limit: number;
    totalPlays: number;
    totalPages: number;
  };
}

export async function getSession(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const sessionIdParam = event.routeParameters?.sessionId;
    if (!sessionIdParam) return respond(400, { error: 'sessionId is required' });
    const sessionId = parseInt(sessionIdParam, 10);
    if (Number.isNaN(sessionId)) return respond(400, { error: 'Invalid sessionId' });

    // Parse query params
    const queryResult = querySchema.safeParse(event.queryStringParameters || {});
    if (!queryResult.success) {
      return respond(400, { error: 'Invalid query parameters', details: queryResult.error.flatten() });
    }
    const { page, limit, pbOnly, leaderboard } = queryResult.data;

    // Determine which leaderboard ID to filter for PBs
    const pbLeaderboardId =
      leaderboard === 'EX' ? LEADERBOARD_EX : leaderboard === 'ITG' ? LEADERBOARD_ITG : leaderboard === 'HardEX' ? LEADERBOARD_HARDEX : null;

    // Fetch session with user info
    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: {
            id: true,
            alias: true,
            profileImageUrl: true,
          },
        },
      },
    });

    if (!session) {
      return respond(404, { error: 'Session not found' });
    }

    // Check if session is ongoing (most recent play was less than 2 hours ago)
    const now = new Date();
    const timeSinceEnd = now.getTime() - session.endedAt.getTime();
    const isOngoing = timeSinceEnd < SESSION_GAP_MS;

    // Calculate duration
    const durationMs = session.endedAt.getTime() - session.startedAt.getTime();

    // Count quads/quints/hexes across all session plays
    const allSessionPlaysForPerfects = await prisma.play.findMany({
      where: {
        userId: session.userId,
        createdAt: { gte: session.startedAt, lte: session.endedAt },
      },
      select: {
        chart: {
          select: {
            meter: true,
            simfiles: { select: { simfile: { select: { packId: true } } } },
          },
        },
        PlayLeaderboard: {
          where: { leaderboardId: { in: [LEADERBOARD_ITG, LEADERBOARD_EX, LEADERBOARD_HARDEX] } },
          select: { leaderboardId: true, data: true },
        },
      },
    });

    const { quads, quints, hexes } = countPerfectScores(allSessionPlaysForPerfects);

    // Convert stored difficulty distribution from { [meter]: count } to array format
    const storedDistribution = (session.difficultyDistribution as Record<string, number>) || {};
    const difficultyDistribution = Object.entries(storedDistribution)
      .map(([meterStr, count]) => ({ meter: parseInt(meterStr, 10), count }))
      .sort((a, b) => a.meter - b.meter);

    // Calculate top packs played (counting each distinct chart once)
    // A chart can appear in multiple packs via SimfileChart->Simfile->Pack relationship
    const distinctChartHashes = await prisma.play.findMany({
      where: {
        userId: session.userId,
        createdAt: {
          gte: session.startedAt,
          lte: session.endedAt,
        },
      },
      select: { chartHash: true },
      distinct: ['chartHash'],
    });

    // Get all pack associations for these charts
    const chartPackAssociations = await prisma.simfileChart.findMany({
      where: {
        chartHash: { in: distinctChartHashes.map((p) => p.chartHash) },
      },
      select: {
        chartHash: true,
        simfile: {
          select: {
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
    });

    // Aggregate: count unique charts per pack (a chart can appear in multiple packs)
    // Store pack metadata for each pack
    interface PackData {
      id: number;
      name: string;
      bannerUrl: string | null;
      mdBannerUrl: string | null;
      smBannerUrl: string | null;
      bannerVariants: any;
      chartHashes: Set<string>;
    }
    const packDataMap = new Map<number, PackData>();
    for (const assoc of chartPackAssociations) {
      const pack = assoc.simfile.pack;
      if (!packDataMap.has(pack.id)) {
        packDataMap.set(pack.id, {
          id: pack.id,
          name: pack.name,
          bannerUrl: pack.bannerUrl,
          mdBannerUrl: pack.mdBannerUrl,
          smBannerUrl: pack.smBannerUrl,
          bannerVariants: pack.bannerVariants,
          chartHashes: new Set(),
        });
      }
      packDataMap.get(pack.id)!.chartHashes.add(assoc.chartHash);
    }

    // Convert to sorted array (top 5) with CloudFront URLs
    const topPacks = Array.from(packDataMap.values())
      .map((pack) => ({
        packId: pack.id,
        packName: pack.name,
        chartCount: pack.chartHashes.size,
        bannerUrl: pack.bannerUrl ? assetS3UrlToCloudFrontUrl(pack.bannerUrl) : null,
        mdBannerUrl: pack.mdBannerUrl ? assetS3UrlToCloudFrontUrl(pack.mdBannerUrl) : null,
        smBannerUrl: pack.smBannerUrl ? assetS3UrlToCloudFrontUrl(pack.smBannerUrl) : null,
        bannerVariants: toCfVariantSet(pack.bannerVariants) || undefined,
      }))
      .sort((a, b) => b.chartCount - a.chartCount)
      .slice(0, 5);

    // Base play filter for this session
    const basePlayFilter = {
      userId: session.userId,
      createdAt: {
        gte: session.startedAt,
        lte: session.endedAt,
      },
    };

    // If pbOnly is true and a leaderboard is specified, find PB play IDs first
    let pbPlayIds: number[] | null = null;
    if (pbOnly && pbLeaderboardId) {
      // Get all plays in this session that have an entry for this leaderboard
      const sessionPlays = await prisma.play.findMany({
        where: basePlayFilter,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          chartHash: true,
          PlayLeaderboard: {
            where: { leaderboardId: pbLeaderboardId },
            select: { sortKey: true },
          },
        },
      });

      // For each play with a leaderboard entry, check if it's a PB
      const pbIds: number[] = [];
      for (const play of sessionPlays) {
        if (play.PlayLeaderboard.length === 0 || !play.PlayLeaderboard[0].sortKey) continue;

        // Find the best play for this chart/leaderboard up to session end (or now if ongoing)
        const bestPlay = await prisma.playLeaderboard.findFirst({
          where: {
            leaderboardId: pbLeaderboardId,
            play: {
              userId: session.userId,
              chartHash: play.chartHash,
              // For completed sessions, consider plays up to session end
              // For ongoing sessions, consider all plays (no upper bound)
              ...(isOngoing ? {} : { createdAt: { lte: session.endedAt } }),
            },
          },
          orderBy: { sortKey: 'desc' },
          select: { playId: true },
        });

        if (bestPlay?.playId === play.id) {
          pbIds.push(play.id);
        }
      }
      pbPlayIds = pbIds;
    }

    // Get total count of plays (considering pbOnly filter)
    const totalPlays = pbPlayIds !== null ? pbPlayIds.length : await prisma.play.count({ where: basePlayFilter });

    // Calculate pagination
    const offset = (page - 1) * limit;

    // Build the where clause for fetching plays
    // If pbPlayIds is set, we paginate the filtered IDs directly
    const playWhereClause = pbPlayIds !== null ? { id: { in: pbPlayIds.slice(offset, offset + limit) } } : basePlayFilter;

    // Fetch plays within the session time range (paginated)
    const plays = await prisma.play.findMany({
      where: playWhereClause,
      orderBy: { createdAt: 'desc' },
      ...(pbPlayIds === null && { skip: offset, take: limit }),
      select: {
        id: true,
        createdAt: true,
        modifiers: true,
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
                    artist: true,
                    bannerUrl: true,
                    mdBannerUrl: true,
                    smBannerUrl: true,
                    bannerVariants: true,
                    pack: {
                      select: {
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
        },
        PlayLeaderboard: {
          where: {
            leaderboardId: {
              in: [LEADERBOARD_EX, LEADERBOARD_ITG, LEADERBOARD_HARDEX],
            },
          },
          select: {
            data: true,
            leaderboardId: true,
            sortKey: true,
            leaderboard: { select: { type: true } },
          },
        },
      },
    });

    // Compute PB status and delta for each play/leaderboard combo
    // A PB means this play has the best sortKey among all plays (including this one) for the same chart/leaderboard
    // sortKey format: <PADDED_SCORE>-<INVERTED_EPOCH>-<ISO_TIMESTAMP>
    // When sorted DESC, the best score wins; for ties, the earlier play wins (higher inverted epoch)
    // Delta = this play's score - previous best score (plays BEFORE this one)
    const pbStatusMap = new Map<string, boolean>(); // key: `${playId}-${leaderboardId}`
    const deltaMap = new Map<string, number | null>(); // key: `${playId}-${leaderboardId}`

    // For each play/leaderboard combo, check if it's a PB and calculate delta
    for (const play of plays) {
      for (const pl of play.PlayLeaderboard) {
        const mapKey = `${play.id}-${pl.leaderboardId}`;
        const currentData = pl.data as { score?: string } | null;
        const currentScore = currentData?.score ? parseFloat(currentData.score) : null;

        // If no sortKey or score, can't determine PB status or delta
        if (!pl.sortKey || currentScore === null) {
          pbStatusMap.set(mapKey, false);
          deltaMap.set(mapKey, null);
          continue;
        }

        // Find the best play for this chart/leaderboard up to session end (or now if ongoing)
        // If this play is the best (first result when sorted by sortKey DESC), it's a PB
        const bestPlay = await prisma.playLeaderboard.findFirst({
          where: {
            leaderboardId: pl.leaderboardId,
            play: {
              userId: session.userId,
              chartHash: play.chart.hash,
              // For completed sessions, consider plays up to session end
              // For ongoing sessions, consider all plays (no upper bound)
              ...(isOngoing ? {} : { createdAt: { lte: session.endedAt } }),
            },
          },
          orderBy: { sortKey: 'desc' },
          select: { playId: true },
        });

        // If this play is the best play, it's a PB
        pbStatusMap.set(mapKey, bestPlay?.playId === play.id);

        // Find the best play BEFORE this one to calculate delta
        const previousBest = await prisma.playLeaderboard.findFirst({
          where: {
            leaderboardId: pl.leaderboardId,
            play: {
              userId: session.userId,
              chartHash: play.chart.hash,
              createdAt: { lt: play.createdAt }, // Strictly before this play
            },
          },
          orderBy: { sortKey: 'desc' },
          select: { data: true },
        });

        if (previousBest) {
          const prevData = previousBest.data as { score?: string } | null;
          const prevScore = prevData?.score ? parseFloat(prevData.score) : null;
          if (prevScore !== null) {
            deltaMap.set(mapKey, parseFloat((currentScore - prevScore).toFixed(2)));
          } else {
            deltaMap.set(mapKey, null);
          }
        } else {
          // No previous play on this chart - first play
          deltaMap.set(mapKey, null);
        }
      }
    }

    // Transform plays to response format
    const transformedPlays: SessionPlay[] = plays.map((play) => {
      const primarySimfile = play.chart.simfiles[0]?.simfile;
      const chartBanner = resolveChartBanner(play.chart.simfiles);
      const modifiersData = play.modifiers as SessionPlay['modifiers'];

      return {
        id: play.id,
        playedAt: play.createdAt.toISOString(),
        modifiers: modifiersData,
        chart: {
          hash: play.chart.hash,
          title: primarySimfile?.title || play.chart.songName || 'Unknown',
          artist: primarySimfile?.artist || play.chart.artist || null,
          stepsType: play.chart.stepsType,
          difficulty: play.chart.difficulty,
          meter: play.chart.meter,
          packName: primarySimfile?.pack?.name || null,
          ...chartBanner,
        },
        leaderboards: play.PlayLeaderboard.map((pl) => {
          const data = pl.data as { score?: string; grade?: string; judgments?: Record<string, number> } | null;
          const mapKey = `${play.id}-${pl.leaderboardId}`;
          return {
            type: pl.leaderboard.type || 'Unknown',
            score: data?.score || '0',
            grade: data?.grade || null,
            judgments: data?.judgments || {},
            isPB: pbStatusMap.get(mapKey) ?? false,
            delta: deltaMap.get(mapKey) ?? null,
          };
        }),
      };
    });

    const response: SessionDetails = {
      id: session.id,
      userId: session.userId,
      userAlias: session.user.alias,
      userProfileImageUrl: session.user.profileImageUrl ? assetS3UrlToCloudFrontUrl(session.user.profileImageUrl) : null,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt.toISOString(),
      isOngoing,
      durationMs,
      playCount: session.playCount,
      distinctCharts: session.distinctCharts,
      stepsHit: session.stepsHit,
      quads,
      quints,
      hexes,
      difficultyDistribution,
      topPacks,
      plays: transformedPlays,
      pagination: {
        page,
        limit,
        totalPlays,
        totalPages: Math.ceil(totalPlays / limit),
      },
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error fetching session:', error);
    return respond(500, { error: 'Internal server error' });
  }
}

/**
 * Get recent sessions globally (with optional rivals filter)
 * GET /sessions/recent
 */
export async function getRecentSessions(event: OptionalAuthEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const queryResult = listSessionsQuerySchema.safeParse(event.queryStringParameters || {});
    if (!queryResult.success) {
      return respond(400, { error: 'Invalid query parameters', details: queryResult.error.flatten() });
    }
    const { page, limit, rivalsOnly } = queryResult.data;
    const skip = (page - 1) * limit;
    const now = new Date();

    // Get rival user IDs if rivalsOnly is requested and user is authenticated
    let rivalUserIds: string[] = [];
    if (rivalsOnly && event.user?.id) {
      const rivals = await prisma.userRival.findMany({
        where: { userId: event.user.id },
        select: { rivalUserId: true },
      });
      rivalUserIds = rivals.map((r) => r.rivalUserId);
    }

    // Build where clause
    const whereClause: any = {};
    if (rivalsOnly && rivalUserIds.length > 0) {
      whereClause.userId = { in: rivalUserIds };
    } else if (rivalsOnly) {
      // User has no rivals, return empty result
      return respond(200, {
        data: [],
        meta: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });
    }

    // Fetch sessions and count in parallel
    const [sessions, totalCount] = await Promise.all([
      prisma.userSession.findMany({
        where: whereClause,
        orderBy: { endedAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              alias: true,
              profileImageUrl: true,
            },
          },
        },
      }),
      prisma.userSession.count({ where: whereClause }),
    ]);

    // Transform to response format
    const data: SessionSummary[] = sessions.map((session) => {
      const timeSinceEnd = now.getTime() - session.endedAt.getTime();
      const isOngoing = timeSinceEnd < SESSION_GAP_MS;

      return {
        id: session.id,
        userId: session.userId,
        userAlias: session.user.alias,
        userProfileImageUrl: session.user.profileImageUrl ? assetS3UrlToCloudFrontUrl(session.user.profileImageUrl) : null,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt.toISOString(),
        isOngoing,
        playCount: session.playCount,
        stepsHit: session.stepsHit,
      };
    });

    // Cap total pages at 10
    const maxPages = 10;
    const actualTotalPages = Math.ceil(totalCount / limit);
    const totalPages = Math.min(actualTotalPages, maxPages);

    return respond(200, {
      data,
      meta: {
        total: Math.min(totalCount, maxPages * limit),
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching recent sessions:', error);
    return respond(500, { error: 'Internal server error' });
  }
}

/**
 * Get sessions for a specific user
 * GET /user/{userId}/sessions
 */
export async function getUserSessions(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.routeParameters?.userId;
    if (!userId) return respond(400, { error: 'userId is required' });

    // Validate UUID format
    const uuidRegex = /^[a-f0-9-]{36}$/;
    if (!uuidRegex.test(userId)) return respond(400, { error: 'Invalid userId format' });

    const queryResult = listSessionsQuerySchema.safeParse(event.queryStringParameters || {});
    if (!queryResult.success) {
      return respond(400, { error: 'Invalid query parameters', details: queryResult.error.flatten() });
    }
    const { page, limit } = queryResult.data;
    const skip = (page - 1) * limit;
    const now = new Date();

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, alias: true, profileImageUrl: true },
    });

    if (!user) {
      return respond(404, { error: 'User not found' });
    }

    // Fetch sessions and count in parallel
    const whereClause = { userId };
    const [sessions, totalCount] = await Promise.all([
      prisma.userSession.findMany({
        where: whereClause,
        orderBy: { endedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.userSession.count({ where: whereClause }),
    ]);

    // Transform to response format
    const data: SessionSummary[] = sessions.map((session) => {
      const timeSinceEnd = now.getTime() - session.endedAt.getTime();
      const isOngoing = timeSinceEnd < SESSION_GAP_MS;

      return {
        id: session.id,
        userId: session.userId,
        userAlias: user.alias,
        userProfileImageUrl: user.profileImageUrl ? assetS3UrlToCloudFrontUrl(user.profileImageUrl) : null,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt.toISOString(),
        isOngoing,
        playCount: session.playCount,
        stepsHit: session.stepsHit,
      };
    });

    // Cap total pages at 10
    const maxPages = 10;
    const actualTotalPages = Math.ceil(totalCount / limit);
    const totalPages = Math.min(actualTotalPages, maxPages);

    return respond(200, {
      data,
      meta: {
        total: Math.min(totalCount, maxPages * limit),
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching user sessions:', error);
    return respond(500, { error: 'Internal server error' });
  }
}
