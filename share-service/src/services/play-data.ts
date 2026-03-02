import { loadTimingDataFromS3 } from '../utils/s3';
import { assetS3UrlToCloudFrontUrl } from '../utils/assets';
import { S3Client } from '@aws-sdk/client-s3';
import { getPrisma } from '../prisma';

const s3Client = new S3Client();

export interface PlayData {
  id: number;
  createdAt: Date;
  user: {
    id: string;
    alias: string;
    profileImageUrl: string | null;
    timezone: string | null;
  };
  chart: {
    hash: string;
    title: string | null;
    artist: string | null;
    stepsType: string | null;
    difficulty: string | null;
    meter: number | null;
    description: string | null;
    credit: string | null;
    bannerUrl: string | null;
  };
  primaryScore: {
    system: string; // e.g. 'EX', 'H.EX', 'ITG'
    score: string;
    grade: string | null;
    judgments: Record<string, number>;
  };
  secondaryScore?: {
    system: string;
    score: string;
    grade: string | null;
  };
  radar?: {
    holdsHeld: number;
    holdsTotal: number;
    minesDodged: number;
    minesTotal: number;
    rollsHit: number;
    rollsTotal: number;
  };
  timingData?: Array<[number, number | 'Miss']>;
  npsData?: Array<{ x: number; y: number }>;
  lifebarInfo?: Array<{ x: number; y: number }>;
  timingStats?: {
    meanMs: number;
    meanAbsMs: number;
    stdMs: number;
    maxErrMs: number;
  };
  modifiers?: {
    disabledWindows?: string | null;
    [key: string]: unknown;
  } | null;
}

export async function fetchPlayData(playId: number, primarySystem: string = 'EX', secondarySystem: string = 'ITG'): Promise<PlayData | null> {
  const prisma = await getPrisma();
  const play = await prisma.play.findUnique({
    where: { id: playId },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      rawTimingDataUrl: true,
      userId: true,
      chartHash: true,
      modifiers: true,
      user: {
        select: {
          id: true,
          alias: true,
          profileImageUrl: true,
          timezone: true,
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
          description: true,
          credit: true,
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
        select: {
          data: true,
          leaderboard: { select: { type: true } },
        },
      },
    },
  });

  if (!play) {
    return null;
  }

  // Helper to find leaderboard by type
  const findLeaderboard = (system: string) => {
    return play.PlayLeaderboard.find((lb: any) => {
      const type = lb.leaderboard.type?.toLowerCase() || '';
      const systemLower = system.toLowerCase();

      if (systemLower === 'ex') {
        return type.includes('ex') && !type.includes('hardex') && !type.includes('hard ex');
      } else if (systemLower === 'h.ex' || systemLower === 'hardex') {
        return type.includes('hardex') || type.includes('hard ex');
      } else if (systemLower === 'itg' || systemLower === 'money') {
        return type.includes('itg') || type.includes('money');
      }
      return false;
    });
  };

  // Find primary leaderboard
  const primaryLeaderboard = findLeaderboard(primarySystem);
  if (!primaryLeaderboard) {
    return null;
  }

  // Find secondary leaderboard (optional)
  const secondaryLeaderboard = findLeaderboard(secondarySystem);

  // Resolve banner: prefer song-level from first simfile, then pack-level, then any simfile with a banner
  const firstSimfile = play.chart.simfiles[0]?.simfile;
  const simfileWithBanner = play.chart.simfiles.find((sf: any) => sf.simfile.bannerUrl || sf.simfile.mdBannerUrl || sf.simfile.smBannerUrl)?.simfile;
  const packWithBanner = play.chart.simfiles.find((sf: any) => sf.simfile.pack?.bannerUrl || sf.simfile.pack?.mdBannerUrl || sf.simfile.pack?.smBannerUrl)
    ?.simfile?.pack;

  const bannerSource = simfileWithBanner || firstSimfile;
  const resolvedBannerUrl =
    bannerSource?.bannerUrl ||
    bannerSource?.mdBannerUrl ||
    bannerSource?.smBannerUrl ||
    packWithBanner?.bannerUrl ||
    packWithBanner?.mdBannerUrl ||
    packWithBanner?.smBannerUrl ||
    null;

  const primarySimfile = firstSimfile;
  const primaryData = primaryLeaderboard.data as any;
  const secondaryData = secondaryLeaderboard?.data as any;

  // Extract radar data from primary
  const radar = primaryData?.radar;

  // Attempt to load timing data
  let timingData: Array<[number, number | 'Miss']> | undefined;
  let npsData: Array<{ x: number; y: number }> | undefined;
  let lifebarInfo: Array<{ x: number; y: number }> | undefined;
  let timingStats: { meanMs: number; meanAbsMs: number; stdMs: number; maxErrMs: number } | undefined;

  console.log(`[Play Data] Raw timing data URL: ${play.rawTimingDataUrl}`);

  try {
    console.log('[Play Data] Attempting to load timing data from S3...');
    const submission: any = await loadTimingDataFromS3(play.rawTimingDataUrl, s3Client);

    console.log('[Play Data] ✓ Timing data loaded successfully');
    console.log(`[Play Data] Timing data points: ${submission.timingData?.length || 0}`);

    timingData = submission.timingData.map((d: any) => [d[0], d[1]]);

    // Scale lifebar from 0-1 to 0-100 for display
    lifebarInfo = submission.lifebarInfo?.map((p: any) => ({ x: p.x, y: p.y * 100 }));
    console.log(`[Play Data] Lifebar points: ${lifebarInfo?.length || 0}`);

    // Calculate timing stats
    const numericOffsets = submission.timingData.filter(([_, off]: [any, any]) => typeof off === 'number').map(([_, off]: [any, any]) => off as number);

    if (numericOffsets.length > 0) {
      const meanMs = (numericOffsets.reduce((sum: number, off: number) => sum + off, 0) / numericOffsets.length) * 1000;
      const meanAbsMs = (numericOffsets.reduce((sum: number, off: number) => sum + Math.abs(off), 0) / numericOffsets.length) * 1000;
      const variance = numericOffsets.reduce((sum: number, off: number) => sum + Math.pow(off - meanMs / 1000, 2), 0) / numericOffsets.length;
      const stdMs = Math.sqrt(variance) * 1000;
      const maxErrMs = Math.max(...numericOffsets.map((off: number) => Math.abs(off))) * 1000;
      timingStats = { meanMs, meanAbsMs, stdMs, maxErrMs };
      console.log('[Play Data] Timing stats calculated:', timingStats);
    }

    const ni = submission.npsInfo;
    if (ni && Array.isArray(ni.points)) {
      const lastTime = submission.timingData[submission.timingData.length - 1]?.[0];
      const durationSeconds = typeof lastTime === 'number' && lastTime > 0 ? lastTime : undefined;
      npsData = ni.points.map((p: any) => {
        const fractional = p.x <= 1.01;
        const x = durationSeconds && fractional ? p.x * durationSeconds : p.x;
        return { x, y: p.y };
      });
      console.log(`[Play Data] NPS data points: ${npsData?.length || 0}`);
    }
  } catch (error) {
    // Timing data optional
    console.error('[Play Data] ✗ Failed to load timing data:', error);
    console.error('[Play Data] Error details:', error instanceof Error ? error.message : String(error));
    timingData = undefined;
    npsData = undefined;
    lifebarInfo = undefined;
  }

  return {
    id: play.id,
    createdAt: play.createdAt,
    user: {
      id: play.user.id,
      alias: play.user.alias,
      profileImageUrl: play.user.profileImageUrl ? assetS3UrlToCloudFrontUrl(play.user.profileImageUrl) : null,
      timezone: play.user.timezone,
    },
    chart: {
      hash: play.chart.hash,
      title: primarySimfile?.title || play.chart.songName || 'Unknown',
      artist: primarySimfile?.artist || play.chart.artist || 'Unknown',
      stepsType: play.chart.stepsType,
      difficulty: play.chart.difficulty,
      meter: play.chart.meter,
      description: play.chart.description,
      credit: play.chart.credit,
      bannerUrl: resolvedBannerUrl ? assetS3UrlToCloudFrontUrl(resolvedBannerUrl) : null,
    },
    primaryScore: {
      system: primarySystem,
      score: primaryData?.score || '0',
      grade: primaryData?.grade || null,
      judgments: primaryData?.judgments || {},
    },
    secondaryScore: secondaryData
      ? {
          system: secondarySystem,
          score: secondaryData?.score || '0',
          grade: secondaryData?.grade || null,
        }
      : undefined,
    radar,
    timingData,
    npsData,
    lifebarInfo,
    timingStats,
    modifiers: play.modifiers as PlayData['modifiers'],
  };
}

export function formatJudgmentsSummary(judgments: Record<string, number>): string {
  const entries = Object.entries(judgments)
    .filter(([_, count]) => count > 0)
    .slice(0, 3);

  return entries.map(([name, count]) => `${count} ${name}`).join(' • ');
}
