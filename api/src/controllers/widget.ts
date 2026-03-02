import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { respond } from '../utils/responses';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  getActiveBlueShiftPhase,
  BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID,
  CombinedLeaderboards,
} from '../utils/events/blueshift';
import { assetS3UrlToCloudFrontUrl } from '../utils/s3';
import { resolveChartBanner } from '../utils/chart-banner';

const S3_BUCKET_ASSETS = process.env.S3_BUCKET_ASSETS || 'arrow-cloud-assets';

/**
 * Get leaderboard IDs for the active Blue Shift phase
 */
function getBlueShiftLeaderboardIds(phaseNumber: 1 | 2 | 3): { hardEX: number; ex: number; itg: number } {
  switch (phaseNumber) {
    case 1:
      return {
        hardEX: BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID,
        ex: BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID,
        itg: BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID,
      };
    case 2:
      return {
        hardEX: BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID,
        ex: BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID,
        itg: BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID,
      };
    case 3:
      return {
        hardEX: BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID,
        ex: BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID,
        itg: BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID,
      };
  }
}

/**
 * Get S3 key for the current phase's leaderboard data
 */
function getPhaseS3Key(phaseNumber: 1 | 2 | 3): string {
  return `json/blueshift-overall-rankings-(phase-${phaseNumber}).json`;
}

/**
 * Fetch leaderboard data from S3
 */
async function fetchLeaderboardFromS3(s3Key: string): Promise<CombinedLeaderboards | null> {
  try {
    console.log(`Fetching leaderboard from S3: ${S3_BUCKET_ASSETS}/${s3Key}`);
    const s3Client = new S3Client({});
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_ASSETS,
      Key: s3Key,
    });

    const response = await s3Client.send(command);
    if (!response.Body) {
      console.error('No body in S3 response');
      return null;
    }

    const jsonString = await response.Body.transformToString();
    const data = JSON.parse(jsonString) as CombinedLeaderboards;
    console.log(`Successfully fetched S3 data with ${Object.keys(data.leaderboards || {}).length} leaderboards`);
    return data;
  } catch (error) {
    console.error(`Error fetching leaderboard from S3 (${S3_BUCKET_ASSETS}/${s3Key}):`, error);
    return null;
  }
}

/**
 * Transform S3 leaderboard data to widget format
 */
function transformLeaderboardData(
  combinedData: CombinedLeaderboards,
  leaderboardType: 'HardEX' | 'EX' | 'ITG',
  userId: string,
  rivalUserIds: string[],
  includeEntries: boolean = true,
): LeaderboardData {
  // Map leaderboard type to S3 data key - using simplified keys (hardEX, EX, money)
  const s3KeyMap: Record<string, string> = {
    HardEX: 'hardEX',
    EX: 'EX',
    ITG: 'money',
  };

  const s3Key = s3KeyMap[leaderboardType];

  if (!s3Key || !combinedData.leaderboards[s3Key]) {
    const availableKeys = Object.keys(combinedData.leaderboards);
    console.warn(`Leaderboard key "${s3Key}" not found for type: ${leaderboardType}. Available keys: ${availableKeys.join(', ')}`);
    return {
      stats: {
        rank: 0,
        totalPoints: 0,
        chartsPlayed: 0,
        totalParticipants: 0,
      },
      entries: [],
    };
  }

  const leaderboard = combinedData.leaderboards[s3Key];

  if (!leaderboard || !leaderboard.rankings) {
    console.warn(`Leaderboard ${s3Key} not found or has no rankings`);
    return {
      stats: {
        rank: 0,
        totalPoints: 0,
        chartsPlayed: 0,
        totalParticipants: 0,
      },
      entries: [],
    };
  }

  const rankings = leaderboard.rankings;
  const totalParticipants = rankings.length;

  // Find user's ranking
  const userRanking = rankings.find((r) => r.userId === userId);
  const userStats: UserStats = userRanking
    ? {
        rank: userRanking.rank,
        totalPoints: userRanking.totalPoints,
        chartsPlayed: userRanking.chartsPlayed,
        totalParticipants,
      }
    : {
        rank: 0,
        totalPoints: 0,
        chartsPlayed: 0,
        totalParticipants,
      };

  // Get smart selection of entries:
  // - If user has no scores (rank 0): show top 10
  // - If user has scores: show top 5 rivals, self, and neighbors
  // - If includeEntries is false: return empty array (stats only)
  const entries: LeaderboardEntry[] = [];

  if (!includeEntries) {
    // Only stats requested, no entries needed
    return {
      stats: userStats,
      entries: [],
    };
  }

  const addedUserIds = new Set<string>();

  // Helper to create entry
  const createEntry = (r: (typeof rankings)[0]): LeaderboardEntry => ({
    rank: r.rank,
    alias: r.userAlias,
    points: r.totalPoints,
    profileImageUrl: r.userProfileImageUrl || null,
    chartsPlayed: r.chartsPlayed,
    isSelf: r.userId === userId,
    isRival: rivalUserIds.includes(r.userId),
  });

  // If user has no scores (rank 0), just show top 10
  if (!userRanking || userStats.rank === 0) {
    const top10 = rankings.slice(0, 10);
    for (const ranking of top10) {
      entries.push(createEntry(ranking));
    }
    return {
      stats: userStats,
      entries,
    };
  }

  // Add top 5 rivals
  const rivals = rankings.filter((r) => rivalUserIds.includes(r.userId)).slice(0, 5);
  for (const rival of rivals) {
    entries.push(createEntry(rival));
    addedUserIds.add(rival.userId);
  }

  // Find self and neighbors
  if (userRanking) {
    const userIndex = rankings.findIndex((r) => r.userId === userId);
    if (userIndex !== -1) {
      // Add 2 above (if not already added)
      for (let i = Math.max(0, userIndex - 2); i < userIndex; i++) {
        if (!addedUserIds.has(rankings[i].userId)) {
          entries.push(createEntry(rankings[i]));
          addedUserIds.add(rankings[i].userId);
        }
      }

      // Add self (if not already added)
      if (!addedUserIds.has(userId)) {
        entries.push(createEntry(rankings[userIndex]));
        addedUserIds.add(userId);
      }

      // Add 2 below (if not already added)
      for (let i = userIndex + 1; i < Math.min(rankings.length, userIndex + 3); i++) {
        if (!addedUserIds.has(rankings[i].userId)) {
          entries.push(createEntry(rankings[i]));
          addedUserIds.add(rankings[i].userId);
        }
      }

      // Fill remaining spots with more neighbors to reach 10
      if (entries.length < 10) {
        // Expand search radius around user
        let radius = 3;
        while (entries.length < 10 && radius < rankings.length) {
          // Check above
          const aboveIndex = userIndex - radius;
          if (aboveIndex >= 0 && !addedUserIds.has(rankings[aboveIndex].userId)) {
            entries.push(createEntry(rankings[aboveIndex]));
            addedUserIds.add(rankings[aboveIndex].userId);
            if (entries.length >= 10) break;
          }

          // Check below
          const belowIndex = userIndex + radius;
          if (belowIndex < rankings.length && !addedUserIds.has(rankings[belowIndex].userId)) {
            entries.push(createEntry(rankings[belowIndex]));
            addedUserIds.add(rankings[belowIndex].userId);
            if (entries.length >= 10) break;
          }

          radius++;
        }
      }
    }
  }

  // Sort by rank
  entries.sort((a, b) => a.rank - b.rank);

  // Limit to 10
  const finalEntries = entries.slice(0, 10);

  return {
    stats: userStats,
    entries: finalEntries,
  };
}

interface LeaderboardEntry {
  rank: number;
  alias: string;
  points: number;
  profileImageUrl: string | null;
  chartsPlayed: number;
  isSelf: boolean;
  isRival: boolean;
}

interface UserStats {
  rank: number;
  totalPoints: number;
  chartsPlayed: number;
  totalParticipants: number;
}

interface LastPlayedChart {
  title: string;
  artist: string;
  bannerUrl: string;
  mdBannerUrl?: string;
  smBannerUrl?: string;
  bannerVariants?: any;
  hash: string;
  difficulty: string;
  meter: number | null;
}

interface LastPlayedScore {
  lastScore: {
    score: number;
    grade: string;
  };
  pbScore: {
    score: number;
    grade: string;
    rank: number;
    totalPlayers: number;
  };
}

interface LeaderboardData {
  stats: UserStats;
  entries: LeaderboardEntry[];
}

interface WidgetData {
  user: {
    id: string;
    alias: string;
    profileImageUrl: string | null;
  };
  leaderboards?: {
    HardEX: LeaderboardData;
    EX: LeaderboardData;
    ITG: LeaderboardData;
  };
  lastPlayed?: {
    chart: LastPlayedChart;
    scores: {
      HardEX: LastPlayedScore;
      EX: LastPlayedScore;
      ITG: LastPlayedScore;
    };
  } | null;
}

/**
 * Get initial widget data for a user
 * GET /web/widget/data?userId={userId}
 */
export const getWidgetData = async (event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  const userId = event.queryStringParameters?.userId;
  const featuresParam = event.queryStringParameters?.features;

  if (!userId) {
    return respond(400, { error: 'userId is required' });
  }

  // Parse enabled features (default to all)
  const enabledFeatures = featuresParam ? featuresParam.split(',') : ['main', 'leaderboard', 'lastPlayed'];
  const showMain = enabledFeatures.includes('main');
  const showLeaderboard = enabledFeatures.includes('leaderboard');
  const showLastPlayed = enabledFeatures.includes('lastPlayed');

  try {
    // Get user info (always needed)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        alias: true,
        profileImageUrl: true,
      },
    });

    if (!user) {
      return respond(404, { error: 'User not found' });
    }

    const widgetData: WidgetData = {
      user: {
        id: user.id,
        alias: user.alias,
        profileImageUrl: user.profileImageUrl ? assetS3UrlToCloudFrontUrl(user.profileImageUrl) : null,
      },
    };

    // Get active phase
    const activePhase = getActiveBlueShiftPhase();
    const leaderboardIds = getBlueShiftLeaderboardIds(activePhase);

    // Fetch leaderboard data from S3 if main, leaderboard, or lastPlayed features are enabled
    // (lastPlayed needs leaderboard data for stats display)
    if (showMain || showLeaderboard || showLastPlayed) {
      const s3Key = getPhaseS3Key(activePhase);
      const leaderboardData = await fetchLeaderboardFromS3(s3Key);

      if (!leaderboardData) {
        console.warn(`Failed to fetch S3 leaderboard data for phase ${activePhase}`);
      }

      if (leaderboardData) {
        // Get user's rivals
        const rivals = await prisma.userRival.findMany({
          where: { userId },
          select: { rivalUserId: true },
        });
        const rivalUserIds = rivals.map((r) => r.rivalUserId);

        // Transform S3 data to widget format
        // If showLeaderboard is false, we still need stats but don't need entries
        widgetData.leaderboards = {
          HardEX: transformLeaderboardData(leaderboardData, 'HardEX', userId, rivalUserIds, showLeaderboard),
          EX: transformLeaderboardData(leaderboardData, 'EX', userId, rivalUserIds, showLeaderboard),
          ITG: transformLeaderboardData(leaderboardData, 'ITG', userId, rivalUserIds, showLeaderboard),
        };
      }
    }

    // Fetch last played data if enabled
    if (showLastPlayed) {
      widgetData.lastPlayed = await fetchLastPlayedData(userId, leaderboardIds, prisma);
    }

    return respond(200, widgetData);
  } catch (error) {
    console.error('Error fetching widget data:', error);
    return respond(500, { error: 'Failed to fetch widget data' });
  }
};

/**
 * Fetch last played chart data with scores for all leaderboards
 */
async function fetchLastPlayedData(
  userId: string,
  leaderboardIds: { hardEX: number; ex: number; itg: number },
  prisma: PrismaClient,
): Promise<WidgetData['lastPlayed']> {
  // Get user's most recent play that has Blue Shift leaderboard entries
  const activeLeaderboardIds = [leaderboardIds.hardEX, leaderboardIds.ex, leaderboardIds.itg];

  const lastPlay = await prisma.play.findFirst({
    where: {
      userId,
      PlayLeaderboard: {
        some: {
          leaderboardId: {
            in: activeLeaderboardIds,
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      chart: true,
      PlayLeaderboard: {
        where: {
          leaderboardId: {
            in: activeLeaderboardIds,
          },
        },
      },
    },
  });

  if (!lastPlay || !lastPlay.chart || lastPlay.PlayLeaderboard.length === 0) {
    return null;
  }

  // Get simfile for banner URL and variants
  const simfileCharts = await prisma.simfileChart.findMany({
    where: { chartHash: lastPlay.chartHash },
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

  const primarySimfile = simfileCharts[0]?.simfile;
  const chartBanner = resolveChartBanner(simfileCharts);

  // Map PlayLeaderboard entries to scores by leaderboard ID
  const leaderboardMap = new Map(lastPlay.PlayLeaderboard.map((pl) => [pl.leaderboardId, pl]));

  const hardEXEntry = leaderboardMap.get(leaderboardIds.hardEX);
  const exEntry = leaderboardMap.get(leaderboardIds.ex);
  const itgEntry = leaderboardMap.get(leaderboardIds.itg);

  // For each leaderboard, get the user's personal best score/grade/rank
  const getPBData = async (leaderboardId: number) => {
    const pbData = await prisma.$queryRaw<Array<{ rank: bigint; totalPlayers: bigint; score: number; grade: string }>>`
      WITH ranked AS (
        SELECT
          p."userId",
          (pl.data->>'score')::decimal AS score,
          pl.data->>'grade' AS grade,
          ROW_NUMBER() OVER (
            PARTITION BY p."userId"
            ORDER BY pl."sortKey" DESC, p."createdAt" DESC, p.id DESC
          ) AS rn
        FROM "PlayLeaderboard" pl
        JOIN "Play" p ON pl."playId" = p.id
        WHERE p."chartHash" = ${lastPlay.chartHash}
          AND pl."leaderboardId" = ${leaderboardId}
      ),
      deduped AS (
        SELECT
          "userId",
          score,
          grade,
          RANK() OVER (ORDER BY score DESC) AS rank
        FROM ranked
        WHERE rn = 1
      )
      SELECT
        d.rank,
        (SELECT COUNT(*) FROM deduped)::bigint AS "totalPlayers",
        d.score::numeric AS score,
        d.grade
      FROM deduped d
      WHERE d."userId" = ${userId}
    `;

    if (pbData.length > 0) {
      return {
        rank: Number(pbData[0].rank),
        totalPlayers: Number(pbData[0].totalPlayers),
        score: Number(pbData[0].score),
        grade: pbData[0].grade || 'F',
      };
    }
    return { rank: 0, totalPlayers: 0, score: 0, grade: 'F' };
  };

  // Fetch PB data for all three leaderboards in parallel
  const [hardEXPB, exPB, itgPB] = await Promise.all([
    hardEXEntry ? getPBData(leaderboardIds.hardEX) : Promise.resolve({ rank: 0, totalPlayers: 0, score: 0, grade: 'F' }),
    exEntry ? getPBData(leaderboardIds.ex) : Promise.resolve({ rank: 0, totalPlayers: 0, score: 0, grade: 'F' }),
    itgEntry ? getPBData(leaderboardIds.itg) : Promise.resolve({ rank: 0, totalPlayers: 0, score: 0, grade: 'F' }),
  ]);

  // Helper to extract score data from last play and PB
  const extractScores = (
    lastPlayEntry: typeof hardEXEntry,
    pbData: { rank: number; totalPlayers: number; score: number; grade: string },
  ): { lastScore: { score: number; grade: string }; pbScore: { score: number; grade: string; rank: number; totalPlayers: number } } => {
    if (!lastPlayEntry) {
      return {
        lastScore: {
          score: 0,
          grade: 'F',
        },
        pbScore: {
          score: 0,
          grade: 'F',
          rank: 0,
          totalPlayers: 0,
        },
      };
    }

    const lastPlayData = lastPlayEntry.data as any;
    return {
      lastScore: {
        score: Number(lastPlayData.score) || 0,
        grade: lastPlayData.grade || 'F',
      },
      pbScore: {
        score: pbData.score,
        grade: pbData.grade,
        rank: pbData.rank,
        totalPlayers: pbData.totalPlayers,
      },
    };
  };

  return {
    chart: {
      title: lastPlay.chart.songName || primarySimfile?.title || 'Unknown',
      artist: lastPlay.chart.artist || primarySimfile?.artist || 'Unknown',
      bannerUrl: chartBanner.bannerUrl || '',
      mdBannerUrl: chartBanner.mdBannerUrl || undefined,
      smBannerUrl: chartBanner.smBannerUrl || undefined,
      bannerVariants: chartBanner.bannerVariants,
      hash: lastPlay.chart.hash,
      difficulty: lastPlay.chart.difficulty || 'Unknown',
      meter: lastPlay.chart.rating || lastPlay.chart.meter || null,
    },
    scores: {
      HardEX: extractScores(hardEXEntry, hardEXPB),
      EX: extractScores(exEntry, exPB),
      ITG: extractScores(itgEntry, itgPB),
    },
  };
}
