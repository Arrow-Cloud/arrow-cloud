import { assetS3UrlToCloudFrontUrl } from '../utils/assets';
import { getPrisma } from '../prisma';
import { loadTimingDataFromS3 } from '../utils/s3';
import { S3Client } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});

export interface SessionPlayData {
  id: number;
  playedAt: Date;
  chart: {
    hash: string;
    title: string | null;
    artist: string | null;
    stepsType: string | null;
    difficulty: string | null;
    meter: number | null;
    bannerUrl: string | null;
  };
  score: {
    system: string;
    score: string;
    grade: string | null;
    judgments: Record<string, number>;
    delta: number | null;
  };
  modifiers?: {
    disabledWindows?: string | null;
    [key: string]: unknown;
  } | null;
  timingData?: Array<[number, number | 'Miss']>;
}

export interface TopPack {
  packId: number;
  packName: string;
  chartCount: number;
  bannerUrl: string | null;
}

export interface SessionData {
  id: number;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  user: {
    id: string;
    alias: string;
    profileImageUrl: string | null;
  };
  stats: {
    playCount: number;
    distinctCharts: number;
    stepsHit: number;
  };
  difficultyDistribution: Array<{ meter: number; count: number }>;
  topPacks: TopPack[];
  selectedPlays: SessionPlayData[];
  scoringSystem: string;
}

// Leaderboard IDs
const LEADERBOARD_EX = 2;
const LEADERBOARD_ITG = 3;
const LEADERBOARD_HARDEX = 4;

function getLeaderboardId(system: string): number {
  const sys = system.toUpperCase();
  if (sys === 'H.EX' || sys === 'HARDEX') return LEADERBOARD_HARDEX;
  if (sys === 'ITG' || sys === 'MONEY') return LEADERBOARD_ITG;
  return LEADERBOARD_EX;
}

export async function fetchSessionData(sessionId: number, playIds: number[], system: string = 'EX'): Promise<SessionData | null> {
  const prisma = await getPrisma();
  const leaderboardId = getLeaderboardId(system);

  // Fetch session
  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      playCount: true,
      distinctCharts: true,
      stepsHit: true,
      difficultyDistribution: true,
      userId: true,
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
    return null;
  }

  // Convert stored difficulty distribution from { [meter]: count } to array format
  const storedDistribution = (session.difficultyDistribution as Record<string, number>) || {};
  const difficultyDistribution = Object.entries(storedDistribution)
    .map(([meterStr, count]) => ({ meter: parseInt(meterStr, 10), count }))
    .sort((a, b) => a.meter - b.meter);

  // Calculate top packs played
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
            },
          },
        },
      },
    },
  });

  interface PackData {
    id: number;
    name: string;
    bannerUrl: string | null;
    chartHashes: Set<string>;
  }
  const packDataMap = new Map<number, PackData>();
  for (const assoc of chartPackAssociations) {
    const pack = assoc.simfile.pack;
    if (!packDataMap.has(pack.id)) {
      packDataMap.set(pack.id, {
        id: pack.id,
        name: pack.name,
        bannerUrl: pack.bannerUrl || pack.mdBannerUrl || pack.smBannerUrl,
        chartHashes: new Set(),
      });
    }
    packDataMap.get(pack.id)!.chartHashes.add(assoc.chartHash);
  }

  const topPacks: TopPack[] = Array.from(packDataMap.values())
    .map((pack) => ({
      packId: pack.id,
      packName: pack.name,
      chartCount: pack.chartHashes.size,
      bannerUrl: pack.bannerUrl ? assetS3UrlToCloudFrontUrl(pack.bannerUrl) : null,
    }))
    .sort((a, b) => b.chartCount - a.chartCount)
    .slice(0, 4);

  // Fetch selected plays with full details
  // Plays must be within the session's time range and belong to the same user
  const selectedPlays = await prisma.play.findMany({
    where: {
      id: { in: playIds },
      userId: session.userId,
      createdAt: {
        gte: session.startedAt,
        lte: session.endedAt,
      },
    },
    select: {
      id: true,
      createdAt: true,
      modifiers: true,
      rawTimingDataUrl: true,
      chart: {
        select: {
          hash: true,
          songName: true,
          artist: true,
          stepsType: true,
          difficulty: true,
          meter: true,
          simfiles: {
            orderBy: { createdAt: 'asc' as const },
            select: {
              createdAt: true,
              simfile: {
                select: {
                  bannerUrl: true,
                  mdBannerUrl: true,
                  smBannerUrl: true,
                  title: true,
                  artist: true,
                  pack: {
                    select: {
                      bannerUrl: true,
                      mdBannerUrl: true,
                      smBannerUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      PlayLeaderboard: {
        where: { leaderboardId },
        select: {
          data: true,
        },
      },
    },
  });

  // Map selected plays to SessionPlayData with timing data and delta calculation
  const mappedPlays: SessionPlayData[] = await Promise.all(
    selectedPlays.map(async (play) => {
      const lbData = play.PlayLeaderboard[0]?.data as any;
      const simfile = play.chart.simfiles[0]?.simfile;
      const simfileWithBanner = play.chart.simfiles.find((sf: any) => sf.simfile.bannerUrl || sf.simfile.mdBannerUrl || sf.simfile.smBannerUrl)?.simfile;
      const packWithBanner = play.chart.simfiles.find((sf: any) => sf.simfile.pack?.bannerUrl || sf.simfile.pack?.mdBannerUrl || sf.simfile.pack?.smBannerUrl)
        ?.simfile?.pack;
      const bannerSource = simfileWithBanner || simfile;
      const bannerUrl =
        bannerSource?.bannerUrl ||
        bannerSource?.mdBannerUrl ||
        bannerSource?.smBannerUrl ||
        packWithBanner?.bannerUrl ||
        packWithBanner?.mdBannerUrl ||
        packWithBanner?.smBannerUrl ||
        null;

      // Load timing data from S3 if available
      let timingData: Array<[number, number | 'Miss']> | undefined;
      if (play.rawTimingDataUrl) {
        try {
          const submission: any = await loadTimingDataFromS3(play.rawTimingDataUrl, s3Client);
          if (submission?.timingData) {
            timingData = submission.timingData.map((d: any) => [d[0], d[1]]);
          }
        } catch (error) {
          console.warn(`Failed to load timing data for play ${play.id}:`, error);
        }
      }

      // Calculate delta: find best previous play on this chart for this user
      let delta: number | null = null;
      const currentScore = lbData?.score ? parseFloat(lbData.score) : null;

      if (currentScore !== null) {
        const previousBest = await prisma.playLeaderboard.findFirst({
          where: {
            leaderboardId,
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
            delta = parseFloat((currentScore - prevScore).toFixed(2));
          }
        }
      }

      return {
        id: play.id,
        playedAt: play.createdAt,
        chart: {
          hash: play.chart.hash,
          title: simfile?.title || play.chart.songName || 'Unknown',
          artist: simfile?.artist || play.chart.artist || 'Unknown Artist',
          stepsType: play.chart.stepsType,
          difficulty: play.chart.difficulty,
          meter: play.chart.meter,
          bannerUrl: bannerUrl ? assetS3UrlToCloudFrontUrl(bannerUrl) : null,
        },
        score: {
          system,
          score: lbData?.score || '0',
          grade: lbData?.grade || null,
          judgments: lbData?.judgments || {},
          delta,
        },
        modifiers: play.modifiers as SessionPlayData['modifiers'],
        timingData,
      };
    }),
  );

  // Sort by the order provided in playIds
  const playIdOrder = new Map(playIds.map((id, i) => [id, i]));
  mappedPlays.sort((a, b) => (playIdOrder.get(a.id) ?? 0) - (playIdOrder.get(b.id) ?? 0));

  const durationMs = session.endedAt ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime() : 0;

  return {
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs,
    user: {
      id: session.user.id,
      alias: session.user.alias,
      profileImageUrl: session.user.profileImageUrl ? assetS3UrlToCloudFrontUrl(session.user.profileImageUrl) : null,
    },
    stats: {
      playCount: session.playCount,
      distinctCharts: session.distinctCharts,
      stepsHit: session.stepsHit,
    },
    difficultyDistribution,
    topPacks,
    selectedPlays: mappedPlays,
    scoringSystem: system,
  };
}
