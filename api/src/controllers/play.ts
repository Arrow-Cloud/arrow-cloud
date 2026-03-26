import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated';
import { ExtendedAPIGatewayProxyEvent, AuthenticatedEvent } from '../utils/types';
import { respond } from '../utils/responses';
import { assetS3UrlToCloudFrontUrl, loadTimingDataFromPlay } from '../utils/s3';
import { S3Client } from '@aws-sdk/client-s3';
import { EX_SCORING_SYSTEM, MONEY_SCORING_SYSTEM, HARD_EX_SCORING_SYSTEM, PlaySubmission } from '../utils/scoring';
import { publishScoreDeletedEvent, EVENT_TYPES } from '../utils/events';
import { resolveChartBanner } from '../utils/chart-banner';
import {
  ITG_LEADERBOARD_ID,
  EX_LEADERBOARD_ID,
  HARD_EX_LEADERBOARD_ID,
  MAX_METER_FOR_PERFECT_SCORES,
  MIN_STEPS_FOR_PERFECT_SCORES,
  EXCLUDED_PACK_IDS,
  extractStepsHit,
  isPerfectScore,
} from '../utils/stats-utils';

const s3Client = new S3Client();

export async function getPlay(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const idParam = event.routeParameters?.playId;
    if (!idParam) return respond(400, { error: 'playId is required' });
    const playId = parseInt(idParam, 10);
    if (Number.isNaN(playId)) return respond(400, { error: 'Invalid playId' });

    const play = await prisma.play.findUnique({
      where: { id: playId },
      select: {
        id: true,
        createdAt: true,
        rawTimingDataUrl: true,
        modifiers: true,
        engineName: true,
        engineVersion: true,
        user: { select: { id: true, alias: true, profileImageUrl: true } },
        chart: {
          select: {
            hash: true,
            stepsType: true,
            difficulty: true,
            meter: true,
            songName: true,
            artist: true,
            simfiles: {
              orderBy: { createdAt: 'asc' },
              select: {
                createdAt: true,
                simfile: {
                  select: {
                    bannerUrl: true,
                    mdBannerUrl: true,
                    smBannerUrl: true,
                    bannerVariants: true,
                    title: true,
                    artist: true,
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
        PlayLeaderboard: {
          select: {
            data: true,
            leaderboard: { select: { type: true } },
          },
        },
      },
    });

    if (!play) return respond(404, { error: 'Play not found' });

    // Resolve banner data with CF URLs
    const primarySimfile = play.chart.simfiles[0]?.simfile;
    const chartBanner = resolveChartBanner(play.chart.simfiles);

    // Attempt to load timing data
    type TimingDatumSimplified = [number, number | 'Miss'];
    let timingData: TimingDatumSimplified[] | undefined;
    let lifebarInfo: PlaySubmission['lifebarInfo'] | undefined;
    let npsData: { x: number; y: number }[] | undefined; // intentionally simplified (drop measure / nps extras)
    try {
      const submission: PlaySubmission = await loadTimingDataFromPlay(
        {
          id: play.id,
          userId: play.user.id,
          chartHash: play.chart.hash,
          createdAt: play.createdAt,
          updatedAt: play.createdAt,
          rawTimingDataUrl: play.rawTimingDataUrl,
          modifiers: play.modifiers,
          engineName: play.engineName,
          engineVersion: play.engineVersion,
        },
        s3Client,
      );

      // Map timingData to the simplified pair for frontend scatter usage
      timingData = submission.timingData.map((d) => [d[0], d[1]]);
      lifebarInfo = submission.lifebarInfo;

      const ni = submission.npsInfo;
      if (ni && Array.isArray(ni.points)) {
        // Determine duration (seconds) from last timing datum's first element
        const lastTime = submission.timingData[submission.timingData.length - 1]?.[0];
        const durationSeconds = typeof lastTime === 'number' && lastTime > 0 ? lastTime : undefined;
        npsData = ni.points.map((p) => {
          const fractional = p.x <= 1.01; // 0-1 normalized range
          const x = durationSeconds && fractional ? p.x * durationSeconds : p.x;
          return { x, y: p.y };
        });
      }
    } catch {
      // optional, ignore if not accessible
      timingData = undefined;
      lifebarInfo = undefined;
      npsData = undefined;
    }

    const response = {
      id: play.id,
      createdAt: play.createdAt.toISOString(),
      user: {
        id: play.user.id,
        alias: play.user.alias,
        profileImageUrl: play.user.profileImageUrl ? assetS3UrlToCloudFrontUrl(play.user.profileImageUrl) : null,
      },
      chart: {
        hash: play.chart.hash,
        title: primarySimfile?.title || play.chart.songName || null,
        artist: primarySimfile?.artist || play.chart.artist || null,
        stepsType: play.chart.stepsType,
        difficulty: play.chart.difficulty,
        meter: play.chart.meter,
        ...chartBanner,
      },
      leaderboards: play.PlayLeaderboard.map((pl: any) => {
        const type = pl.leaderboard.type || '';
        const lower = type.toLowerCase();
        const system = lower.includes('hardex')
          ? HARD_EX_SCORING_SYSTEM
          : lower.includes(' money') || lower.includes('itg') || lower.includes('money')
            ? MONEY_SCORING_SYSTEM
            : EX_SCORING_SYSTEM;

        const orderMap: Record<string, number> = {};
        system.windows
          .slice()
          .sort((a, b) => a.maxOffset - b.maxOffset)
          .forEach((w, idx) => (orderMap[w.name] = idx));
        orderMap['Miss'] = Number.POSITIVE_INFINITY;

        // todo: typing
        const data = pl.data as { judgments?: Record<string, number> } | null;
        let judgmentsOrdered: { name: string; value: number }[] | undefined;
        if (data?.judgments) {
          judgmentsOrdered = Object.entries(data.judgments)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => {
              const ai = orderMap[a.name] ?? Number.MAX_SAFE_INTEGER;
              const bi = orderMap[b.name] ?? Number.MAX_SAFE_INTEGER;
              return ai === bi ? a.name.localeCompare(b.name) : ai - bi;
            });
        }

        return {
          leaderboard: pl.leaderboard.type,
          data: data
            ? {
                ...data,
                ...(judgmentsOrdered ? { judgmentsOrdered } : {}),
              }
            : {},
        };
      }),
      timingData: timingData || null,
      lifebarInfo: lifebarInfo || null,
      npsData: npsData || null,
      modifiers: play.modifiers || null,
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error getting play:', error);
    return respond(500, { error: 'Internal server error' });
  }
}

export async function deletePlay(event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const idParam = event.routeParameters?.playId;
    if (!idParam) return respond(400, { error: 'playId is required' });
    const playId = parseInt(idParam, 10);
    if (Number.isNaN(playId)) return respond(400, { error: 'Invalid playId' });

    // First, check if the play exists and verify ownership
    // Also fetch data needed for the score-deleted event (all leaderboards for quad/quint/hex detection)
    const play = await prisma.play.findUnique({
      where: { id: playId, userId: event.user.id },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        chartHash: true,
        chart: {
          select: {
            hash: true,
            songName: true,
            difficulty: true,
            meter: true,
            simfileId: true,
            simfiles: { select: { simfile: { select: { packId: true } } } },
          },
        },
        PlayLeaderboard: {
          select: { leaderboardId: true, data: true },
        },
      },
    });

    if (!play) {
      return respond(404, { error: 'Play not found' });
    }

    // Capture data for the event before deletion
    const playTimestamp = play.createdAt.toISOString();
    const chartHash = play.chartHash;
    const meter = play.chart?.meter ?? null;
    const itgData = play.PlayLeaderboard.find((pl) => pl.leaderboardId === ITG_LEADERBOARD_ID)?.data;
    const exData = play.PlayLeaderboard.find((pl) => pl.leaderboardId === EX_LEADERBOARD_ID)?.data;
    const hexData = play.PlayLeaderboard.find((pl) => pl.leaderboardId === HARD_EX_LEADERBOARD_ID)?.data;
    const stepsHit = extractStepsHit(itgData);

    // Determine if this play was a quad/quint/hex
    const chartPackIds = play.chart?.simfiles?.map((sc) => sc.simfile.packId) ?? [];
    const chartInPack = chartPackIds.length > 0;
    const chartInExcludedPack = chartPackIds.some((id) => EXCLUDED_PACK_IDS.includes(id));
    const meterOk = meter != null && meter <= MAX_METER_FOR_PERFECT_SCORES;
    const enoughSteps = stepsHit >= MIN_STEPS_FOR_PERFECT_SCORES;
    const qualifiesForPerfectScores = chartInPack && !chartInExcludedPack && meterOk && enoughSteps;

    const wasQuad = qualifiesForPerfectScores && isPerfectScore(itgData);
    const wasQuint = qualifiesForPerfectScores && isPerfectScore(exData);
    const wasHex = qualifiesForPerfectScores && isPerfectScore(hexData);

    // Delete the play and all related records using a transaction
    await prisma.$transaction(async (tx) => {
      // First delete PlayLeaderboard records
      await tx.playLeaderboard.deleteMany({
        where: { playId: playId },
      });

      // Then delete Lifebar records (if any)
      await tx.lifebar.deleteMany({
        where: { playId: playId },
      });

      // Finally delete the play itself
      await tx.play.delete({
        where: { id: playId },
      });
    });

    console.log(`Play ${playId} deleted by user ${event.user.id} (${event.user.alias})`);

    // Publish score-deleted event to trigger stats recalculation
    try {
      console.log('Publishing score deleted event...');
      await publishScoreDeletedEvent({
        eventType: EVENT_TYPES.SCORE_DELETED,
        timestamp: new Date().toISOString(),
        userId: event.user.id,
        chartHash,
        playTimestamp,
        stepsHit,
        meter,
        wasQuad,
        wasQuint,
        wasHex,
      });
      console.log('Score deleted event published successfully');
    } catch (error) {
      console.error('Failed to publish score deleted event:', error);
      // Don't fail the request if event publication fails
    }

    return respond(200, {
      message: 'Play deleted successfully',
      deletedPlayId: playId,
    });
  } catch (error) {
    console.error('Error deleting play:', error);
    return respond(500, { error: 'Internal server error' });
  }
}
