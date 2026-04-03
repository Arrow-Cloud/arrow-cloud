import type { SQSEvent, SQSHandler, SQSBatchResponse } from 'aws-lambda';
import { PrismaClient } from '../prisma/generated/client';
import { ScoreSubmissionEvent, ScoreDeletedEvent, EVENT_TYPES } from './utils/events';
import { getDatabaseUrl } from './utils/secrets';
import {
  ITG_LEADERBOARD_ID,
  EX_LEADERBOARD_ID,
  HARD_EX_LEADERBOARD_ID,
  extractStepsHit,
  isPerfectScore,
  isPlayEligibleForPerfectScores,
} from './utils/stats-utils';

let prisma: PrismaClient | undefined;

async function getPrismaClient(): Promise<PrismaClient> {
  if (!prisma) {
    const dbUrl = await getDatabaseUrl();
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });
  }
  return prisma;
}

interface UserStats {
  totalPlays: number;
  chartsPlayed: number;
  stepsHit: number;
  heatMap: Record<string, number>; // { "YYYY-MM-DD": playCount }
  quads: number;
  quints: number;
  hexes: number;
}

/**
 * Get a date string in YYYY-MM-DD format for a given timezone
 * @param date - The date to format (defaults to now)
 * @param timezone - IANA timezone string (e.g., 'America/New_York'). Defaults to UTC.
 */
function getDateStringInTimezone(date: Date = new Date(), timezone: string = 'UTC'): string {
  try {
    // Format date in the specified timezone
    // Using 'en-CA' locale to get YYYY-MM-DD format directly
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    // Fallback to UTC if timezone is invalid
    return date.toISOString().split('T')[0];
  }
}

// Session gap threshold (2 hours in milliseconds)
const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

/**
 * Process a single score submission event and update user stats
 */
async function processScoreSubmission(event: ScoreSubmissionEvent, prismaClient: PrismaClient): Promise<void> {
  const { userId } = event;
  const playId = parseInt(event.play.id, 10);

  console.log(`Processing stats update for user ${userId}, play ${playId}`);

  try {
    // Query the database for total play count, unique charts, user's current stats, leaderboard data, and chart info
    const [totalPlays, uniqueCharts, user, itgLeaderboard, exLeaderboard, hexLeaderboard, chart] = await Promise.all([
      prismaClient.play.count({
        where: { userId },
      }),
      prismaClient.play.findMany({
        where: { userId },
        select: { chartHash: true },
        distinct: ['chartHash'],
      }),
      prismaClient.user.findUnique({
        where: { id: userId },
        select: { stats: true, timezone: true },
      }),
      prismaClient.playLeaderboard.findUnique({
        where: {
          playId_leaderboardId: {
            playId,
            leaderboardId: ITG_LEADERBOARD_ID,
          },
        },
        select: { data: true },
      }),
      prismaClient.playLeaderboard.findUnique({
        where: {
          playId_leaderboardId: {
            playId,
            leaderboardId: EX_LEADERBOARD_ID,
          },
        },
        select: { data: true },
      }),
      prismaClient.playLeaderboard.findUnique({
        where: {
          playId_leaderboardId: {
            playId,
            leaderboardId: HARD_EX_LEADERBOARD_ID,
          },
        },
        select: { data: true },
      }),
      prismaClient.chart.findUnique({
        where: { hash: event.chartHash },
        select: {
          meter: true,
          simfileId: true,
          simfiles: { select: { simfile: { select: { packId: true } } } },
        },
      }),
    ]);

    const chartsPlayed = uniqueCharts.length;

    // Get existing stats (additive behavior for stepsHit, heatMap, quads, quints, hexes)
    const existingStats = (user?.stats as UserStats | null) || { totalPlays: 0, chartsPlayed: 0, stepsHit: 0, heatMap: {}, quads: 0, quints: 0, hexes: 0 };
    const existingStepsHit = existingStats.stepsHit || 0;
    const existingHeatMap = existingStats.heatMap || {};

    // Extract steps hit from this play's ITG leaderboard data
    const newStepsHit = extractStepsHit(itgLeaderboard?.data);

    // Update heatMap for today (using user's preferred timezone, fallback to UTC)
    const userTimezone = user?.timezone || 'UTC';
    const today = getDateStringInTimezone(new Date(), userTimezone);
    const updatedHeatMap = { ...existingHeatMap };
    updatedHeatMap[today] = (updatedHeatMap[today] || 0) + 1;

    // Determine if this play qualifies as a quad/quint/hex
    const chartPackIds = chart?.simfiles?.map((sc) => sc.simfile.packId) ?? [];
    const qualifiesForPerfectScores = isPlayEligibleForPerfectScores(chartPackIds, chart?.meter, newStepsHit);

    let quadIncrement = 0;
    let quintIncrement = 0;
    let hexIncrement = 0;

    if (qualifiesForPerfectScores) {
      if (isPerfectScore(itgLeaderboard?.data)) quadIncrement = 1;
      if (isPerfectScore(exLeaderboard?.data)) quintIncrement = 1;
      if (isPerfectScore(hexLeaderboard?.data)) hexIncrement = 1;
    }

    // Update user stats with the current totals (stepsHit, heatMap, quads/quints/hexes are additive)
    const updatedStats: UserStats = {
      totalPlays,
      chartsPlayed,
      stepsHit: existingStepsHit + newStepsHit,
      heatMap: updatedHeatMap,
      quads: (existingStats.quads || 0) + quadIncrement,
      quints: (existingStats.quints || 0) + quintIncrement,
      hexes: (existingStats.hexes || 0) + hexIncrement,
    };

    // Update user stats
    await prismaClient.user.update({
      where: { id: userId },
      data: { stats: updatedStats as any },
    });

    console.log(
      `Updated stats for user ${userId}: totalPlays=${updatedStats.totalPlays}, chartsPlayed=${updatedStats.chartsPlayed}, stepsHit=${updatedStats.stepsHit} (+${newStepsHit}), quads=${updatedStats.quads} (+${quadIncrement}), quints=${updatedStats.quints} (+${quintIncrement}), hexes=${updatedStats.hexes} (+${hexIncrement})`,
    );

    // Update user session
    await updateUserSession(prismaClient, userId, event.chartHash, event.timestamp, newStepsHit, chart?.meter ?? null);
  } catch (error) {
    console.error(`Failed to update stats for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Update or create a user session based on the new play.
 * Sessions are defined as periods of play activity separated by 2+ hour gaps.
 */
async function updateUserSession(
  prismaClient: PrismaClient,
  userId: string,
  chartHash: string,
  playTimestamp: string,
  stepsHit: number,
  meter: number | null,
): Promise<void> {
  const playTime = new Date(playTimestamp);

  // Get the user's most recent session
  const latestSession = await prismaClient.userSession.findFirst({
    where: { userId },
    orderBy: { startedAt: 'desc' },
  });

  if (latestSession) {
    const timeSinceLastPlay = playTime.getTime() - latestSession.endedAt.getTime();

    if (timeSinceLastPlay < SESSION_GAP_MS) {
      // Within session gap - update existing session
      // Check if this chart is new to the session by querying distinct charts in session's time range
      const distinctChartsInSession = await prismaClient.play.findMany({
        where: {
          userId,
          createdAt: {
            gte: latestSession.startedAt,
            lte: playTime,
          },
        },
        select: { chartHash: true },
        distinct: ['chartHash'],
      });

      const distinctCharts = distinctChartsInSession.length;

      // Update difficulty distribution
      const existingDistribution = (latestSession.difficultyDistribution as Record<string, number>) || {};
      const updatedDistribution = { ...existingDistribution };
      if (meter !== null) {
        const meterKey = String(meter);
        updatedDistribution[meterKey] = (updatedDistribution[meterKey] || 0) + 1;
      }

      await prismaClient.userSession.update({
        where: { id: latestSession.id },
        data: {
          endedAt: playTime,
          playCount: { increment: 1 },
          distinctCharts,
          stepsHit: { increment: stepsHit },
          difficultyDistribution: updatedDistribution,
        },
      });

      console.log(`Updated session ${latestSession.id} for user ${userId}: playCount=${latestSession.playCount + 1}, distinctCharts=${distinctCharts}`);
      return;
    }
  }

  // No active session or gap exceeded - create a new session
  // Build initial difficulty distribution
  const initialDistribution: Record<string, number> = {};
  if (meter !== null) {
    initialDistribution[String(meter)] = 1;
  }

  const newSession = await prismaClient.userSession.create({
    data: {
      userId,
      startedAt: playTime,
      endedAt: playTime,
      playCount: 1,
      distinctCharts: 1,
      stepsHit,
      difficultyDistribution: initialDistribution,
    },
  });

  console.log(`Created new session ${newSession.id} for user ${userId}`);
}

// Minimum session requirements
const MIN_PLAYS_PER_SESSION = 2;
const MIN_SESSION_DURATION_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Process a score deletion event - recalculate user stats and affected session
 */
async function processScoreDeletion(event: ScoreDeletedEvent, prismaClient: PrismaClient): Promise<void> {
  const { userId, playTimestamp, stepsHit: deletedStepsHit } = event;
  const playTime = new Date(playTimestamp);

  console.log(`Processing score deletion for user ${userId}, playTimestamp=${playTimestamp}`);

  try {
    // Query the database for updated totals
    const [totalPlays, uniqueCharts, user] = await Promise.all([
      prismaClient.play.count({
        where: { userId },
      }),
      prismaClient.play.findMany({
        where: { userId },
        select: { chartHash: true },
        distinct: ['chartHash'],
      }),
      prismaClient.user.findUnique({
        where: { id: userId },
        select: { stats: true, timezone: true },
      }),
    ]);

    const chartsPlayed = uniqueCharts.length;
    const userTimezone = user?.timezone || 'UTC';

    // Get existing stats and subtract the deleted play's contribution
    const existingStats = (user?.stats as UserStats | null) || { totalPlays: 0, chartsPlayed: 0, stepsHit: 0, heatMap: {}, quads: 0, quints: 0, hexes: 0 };
    const existingStepsHit = existingStats.stepsHit || 0;
    const existingHeatMap = existingStats.heatMap || {};

    // Update stepsHit by subtracting the deleted play's steps
    const newStepsHit = Math.max(0, existingStepsHit - deletedStepsHit);

    // Update heatMap by decrementing the day of the deleted play
    const playDate = getDateStringInTimezone(playTime, userTimezone);
    const updatedHeatMap = { ...existingHeatMap };
    if (updatedHeatMap[playDate]) {
      updatedHeatMap[playDate] = Math.max(0, updatedHeatMap[playDate] - 1);
      if (updatedHeatMap[playDate] === 0) {
        delete updatedHeatMap[playDate];
      }
    }

    // Subtract quad/quint/hex counts from the deleted play
    const wasQuad = event.wasQuad ?? false;
    const wasQuint = event.wasQuint ?? false;
    const wasHex = event.wasHex ?? false;

    // Update user stats
    const updatedStats: UserStats = {
      totalPlays,
      chartsPlayed,
      stepsHit: newStepsHit,
      heatMap: updatedHeatMap,
      quads: Math.max(0, (existingStats.quads || 0) - (wasQuad ? 1 : 0)),
      quints: Math.max(0, (existingStats.quints || 0) - (wasQuint ? 1 : 0)),
      hexes: Math.max(0, (existingStats.hexes || 0) - (wasHex ? 1 : 0)),
    };

    await prismaClient.user.update({
      where: { id: userId },
      data: { stats: updatedStats as any },
    });

    console.log(
      `Updated stats for user ${userId}: totalPlays=${updatedStats.totalPlays}, chartsPlayed=${updatedStats.chartsPlayed}, stepsHit=${updatedStats.stepsHit} (-${deletedStepsHit}), quads=${updatedStats.quads}, quints=${updatedStats.quints}, hexes=${updatedStats.hexes}`,
    );

    // Find and recalculate the affected session
    await recalculateAffectedSession(prismaClient, userId, playTime);
  } catch (error) {
    console.error(`Failed to process score deletion for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Recalculate the session affected by a deleted play.
 * Finds the session containing the play time, recalculates its stats from remaining plays,
 * or deletes it if no valid plays remain.
 */
async function recalculateAffectedSession(prismaClient: PrismaClient, userId: string, playTime: Date): Promise<void> {
  // Find the session that contained this play
  const affectedSession = await prismaClient.userSession.findFirst({
    where: {
      userId,
      startedAt: { lte: playTime },
      endedAt: { gte: playTime },
    },
  });

  if (!affectedSession) {
    console.log(`No session found containing play at ${playTime.toISOString()} for user ${userId}`);
    return;
  }

  console.log(`Found affected session ${affectedSession.id} for user ${userId}`);

  // Fetch all remaining plays in this session's original time window
  // We need to recalculate the session completely from the remaining plays
  const remainingPlays = await prismaClient.play.findMany({
    where: {
      userId,
      createdAt: {
        gte: affectedSession.startedAt,
        lte: affectedSession.endedAt,
      },
    },
    select: {
      id: true,
      chartHash: true,
      createdAt: true,
      chart: {
        select: { meter: true },
      },
      PlayLeaderboard: {
        where: { leaderboardId: ITG_LEADERBOARD_ID },
        select: { data: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (remainingPlays.length === 0) {
    // No plays left, delete the session
    await prismaClient.userSession.delete({
      where: { id: affectedSession.id },
    });
    console.log(`Deleted empty session ${affectedSession.id} for user ${userId}`);
    return;
  }

  // Group remaining plays into sessions based on 2-hour gaps
  // A single deleted play could split a session or just reduce stats
  interface SessionGroup {
    plays: typeof remainingPlays;
    chartHashes: Set<string>;
  }

  const sessionGroups: SessionGroup[] = [];
  let currentGroup: SessionGroup | null = null;

  for (const play of remainingPlays) {
    if (!currentGroup) {
      currentGroup = {
        plays: [play],
        chartHashes: new Set([play.chartHash]),
      };
    } else {
      const lastPlay = currentGroup.plays[currentGroup.plays.length - 1];
      const gap = play.createdAt.getTime() - lastPlay.createdAt.getTime();

      if (gap >= SESSION_GAP_MS) {
        sessionGroups.push(currentGroup);
        currentGroup = {
          plays: [play],
          chartHashes: new Set([play.chartHash]),
        };
      } else {
        currentGroup.plays.push(play);
        currentGroup.chartHashes.add(play.chartHash);
      }
    }
  }

  if (currentGroup) {
    sessionGroups.push(currentGroup);
  }

  // Process the session groups
  if (sessionGroups.length === 0) {
    // No valid sessions, delete the old one
    await prismaClient.userSession.delete({
      where: { id: affectedSession.id },
    });
    console.log(`Deleted session ${affectedSession.id} (no valid groups) for user ${userId}`);
    return;
  }

  // Update the first group as the existing session
  const firstGroup = sessionGroups[0];
  const firstGroupStats = calculateSessionStats(firstGroup);

  if (firstGroupStats) {
    await prismaClient.userSession.update({
      where: { id: affectedSession.id },
      data: {
        startedAt: firstGroupStats.startedAt,
        endedAt: firstGroupStats.endedAt,
        playCount: firstGroupStats.playCount,
        distinctCharts: firstGroupStats.distinctCharts,
        stepsHit: firstGroupStats.stepsHit,
        difficultyDistribution: firstGroupStats.difficultyDistribution,
      },
    });
    console.log(
      `Updated session ${affectedSession.id}: playCount=${firstGroupStats.playCount}, distinctCharts=${firstGroupStats.distinctCharts}, stepsHit=${firstGroupStats.stepsHit}`,
    );
  } else {
    // First group doesn't meet minimum requirements - delete the session
    // and process remaining groups as new sessions
    await prismaClient.userSession.delete({
      where: { id: affectedSession.id },
    });
    console.log(`Deleted session ${affectedSession.id} (doesn't meet min requirements) for user ${userId}`);
  }

  // Create new sessions for any additional groups (if the deletion caused a split)
  const groupsToCreate = firstGroupStats ? sessionGroups.slice(1) : sessionGroups;
  for (const group of groupsToCreate) {
    const stats = calculateSessionStats(group);
    if (stats) {
      const newSession = await prismaClient.userSession.create({
        data: {
          userId,
          startedAt: stats.startedAt,
          endedAt: stats.endedAt,
          playCount: stats.playCount,
          distinctCharts: stats.distinctCharts,
          stepsHit: stats.stepsHit,
          difficultyDistribution: stats.difficultyDistribution,
        },
      });
      console.log(`Created new session ${newSession.id} from split for user ${userId}`);
    }
  }
}

interface SessionStats {
  startedAt: Date;
  endedAt: Date;
  playCount: number;
  distinctCharts: number;
  stepsHit: number;
  difficultyDistribution: Record<string, number>;
}

/**
 * Calculate session stats from a group of plays.
 * Returns null if the session doesn't meet minimum requirements.
 */
function calculateSessionStats(group: {
  plays: Array<{
    createdAt: Date;
    chartHash: string;
    chart: { meter: number | null } | null;
    PlayLeaderboard: Array<{ data: unknown }>;
  }>;
  chartHashes: Set<string>;
}): SessionStats | null {
  const { plays, chartHashes } = group;

  if (plays.length < MIN_PLAYS_PER_SESSION) {
    return null;
  }

  const startedAt = plays[0].createdAt;
  const endedAt = plays[plays.length - 1].createdAt;
  const duration = endedAt.getTime() - startedAt.getTime();

  if (duration < MIN_SESSION_DURATION_MS) {
    return null;
  }

  let stepsHit = 0;
  const difficultyDistribution: Record<string, number> = {};

  for (const play of plays) {
    stepsHit += extractStepsHit(play.PlayLeaderboard[0]?.data);
    const meter = play.chart?.meter;
    if (meter !== null && meter !== undefined) {
      const meterKey = String(meter);
      difficultyDistribution[meterKey] = (difficultyDistribution[meterKey] || 0) + 1;
    }
  }

  return {
    startedAt,
    endedAt,
    playCount: plays.length,
    distinctCharts: chartHashes.size,
    stepsHit,
    difficultyDistribution,
  };
}

/**
 * SQS Handler for processing user stats updates
 */
export const handler: SQSHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  console.log(`Processing ${event.Records.length} user stats messages`);

  const prismaClient = await getPrismaClient();
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      // Parse the SNS message
      const snsMessage = JSON.parse(record.body);
      const scoreEvent = JSON.parse(snsMessage.Message) as { eventType: string };

      // Dispatch based on event type
      if (scoreEvent.eventType === EVENT_TYPES.SCORE_SUBMITTED) {
        await processScoreSubmission(scoreEvent as ScoreSubmissionEvent, prismaClient);
      } else if (scoreEvent.eventType === EVENT_TYPES.SCORE_DELETED) {
        await processScoreDeletion(scoreEvent as ScoreDeletedEvent, prismaClient);
      } else {
        console.warn(`Skipping unknown event type: ${scoreEvent.eventType}`);
      }
    } catch (error) {
      console.error(`Failed to process record ${record.messageId}:`, error);
      // Report failure for this specific message so it can be retried
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  if (batchItemFailures.length > 0) {
    console.log(`${batchItemFailures.length} messages failed and will be retried`);
  } else {
    console.log('All messages processed successfully');
  }

  return {
    batchItemFailures,
  };
};
