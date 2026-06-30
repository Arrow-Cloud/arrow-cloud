import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { respond } from '../utils/responses';
import { assetS3UrlToCloudFrontUrl, S3_BUCKET_ASSETS } from '../utils/s3';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { resolveChartBanner } from '../utils/chart-banner';
import { GLOBAL_HARD_EX_LEADERBOARD_ID, GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID } from '../utils/leaderboard';
import { type ScoringSystemKey, type PackLeaderboardDifficulty } from '../utils/pack-leaderboard';

const s3Client = new S3Client();

type LeaderboardKey = 'HardEX' | 'EX' | 'ITG';

type WidgetFeatureConfig =
  | { type: 'profile' }
  | { type: 'recentPlays'; leaderboards: LeaderboardKey[] }
  | { type: 'packLeaderboard'; packId: number; packName: string; difficulty: PackLeaderboardDifficulty; leaderboards: LeaderboardKey[] };

interface WidgetConfig {
  version: 1;
  orientation: 'horizontal' | 'vertical';
  features: WidgetFeatureConfig[];
}

const LB_KEY_TO_ID: Record<LeaderboardKey, number> = {
  HardEX: GLOBAL_HARD_EX_LEADERBOARD_ID,
  EX: GLOBAL_EX_LEADERBOARD_ID,
  ITG: GLOBAL_MONEY_LEADERBOARD_ID,
};

function decodeConfig(encoded: string): WidgetConfig | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8')) as WidgetConfig;
  } catch {
    return null;
  }
}

async function loadPackLeaderboardS3(packId: number): Promise<Record<string, any> | null> {
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
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    console.error(`Error loading pack leaderboard for pack ${packId}:`, err);
    return null;
  }
}

async function getRecentPlaysForWidget(userId: string, leaderboardIds: number[], prisma: PrismaClient) {
  const plays = await prisma.play.findMany({
    where: {
      userId,
      PlayLeaderboard: {
        some: {
          leaderboardId: { in: leaderboardIds },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      createdAt: true,
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
            take: 1,
            select: {
              stepsType: true,
              difficulty: true,
              meter: true,
              simfile: {
                select: {
                  title: true,
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
      PlayLeaderboard: {
        where: { leaderboardId: { in: leaderboardIds } },
        select: {
          leaderboard: { select: { type: true } },
          data: true,
        },
      },
    },
  });

  return plays.map((play) => {
    const chartBanner = resolveChartBanner(play.chart.simfiles as any);
    const primarySimfile = play.chart.simfiles[0]?.simfile;
    return {
      playId: play.id,
      chart: {
        hash: play.chart.hash,
        ...chartBanner,
        title: primarySimfile?.title ?? play.chart.songName,
        artist: primarySimfile?.artist ?? play.chart.artist,
        stepsType: play.chart.stepsType,
        difficulty: play.chart.difficulty,
        meter: play.chart.meter,
      },
      leaderboards: play.PlayLeaderboard.map((pl: any) => ({
        leaderboard: pl.leaderboard.type,
        data: pl.data,
      })),
      createdAt: play.createdAt,
    };
  });
}

/**
 * Get widget data for a user.
 * GET /widget/data?userId={userId}&config={base64}
 */
export const getWidgetData = async (event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  const userId = event.queryStringParameters?.userId;

  if (!userId) {
    return respond(400, { error: 'userId is required' });
  }

  const configEncoded = event.queryStringParameters?.config;
  const config: WidgetConfig | null = configEncoded ? decodeConfig(configEncoded) : null;

  const recentPlaysFeature = config?.features.find((f): f is Extract<WidgetFeatureConfig, { type: 'recentPlays' }> => f.type === 'recentPlays');
  const packLeaderboardFeatures =
    config?.features.filter((f): f is Extract<WidgetFeatureConfig, { type: 'packLeaderboard' }> => f.type === 'packLeaderboard') ?? [];

  try {
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

    const recentPlaysLeaderboardIds = recentPlaysFeature ? recentPlaysFeature.leaderboards.map((k) => LB_KEY_TO_ID[k]) : [];

    const [recentPlays, ...packLeaderboardResults] = await Promise.all([
      recentPlaysFeature ? getRecentPlaysForWidget(userId, recentPlaysLeaderboardIds, prisma) : Promise.resolve(null),
      ...packLeaderboardFeatures.map((f) => loadPackLeaderboardS3(f.packId)),
    ]);

    const packLeaderboards: Record<number, any> = {};
    packLeaderboardFeatures.forEach((f, i) => {
      const s3Data = packLeaderboardResults[i];
      if (!s3Data) {
        packLeaderboards[f.packId] = { packName: f.packName, leaderboards: {} };
        return;
      }
      const lbData: Record<string, any> = {};
      for (const lbKey of f.leaderboards) {
        const systemData = s3Data.leaderboards?.[f.difficulty]?.[lbKey as ScoringSystemKey];
        if (!systemData) continue;
        const entry = systemData.rankings?.find((r: any) => r.userId === userId);
        if (entry) {
          lbData[lbKey] = {
            rank: entry.rank,
            totalScore: entry.totalScore,
            totalParticipants: systemData.totalParticipants,
          };
        }
      }
      packLeaderboards[f.packId] = { packName: f.packName, leaderboards: lbData };
    });

    const response: any = {
      user: {
        id: user.id,
        alias: user.alias,
        profileImageUrl: user.profileImageUrl ? assetS3UrlToCloudFrontUrl(user.profileImageUrl) : null,
      },
    };

    if (recentPlaysFeature) {
      response.recentPlays = recentPlays;
    }

    if (packLeaderboardFeatures.length > 0) {
      response.packLeaderboards = packLeaderboards;
    }

    return respond(200, response);
  } catch (error) {
    console.error('Error fetching widget data:', error);
    return respond(500, { error: 'Failed to fetch widget data' });
  }
};
