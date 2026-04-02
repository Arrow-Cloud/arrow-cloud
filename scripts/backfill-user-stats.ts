import { Prisma, PrismaClient } from '../api/prisma/generated/client';
import {
  ITG_LEADERBOARD_ID,
  EX_LEADERBOARD_ID,
  HARD_EX_LEADERBOARD_ID,
  MAX_METER_FOR_PERFECT_SCORES,
  MIN_STEPS_FOR_PERFECT_SCORES,
  EXCLUDED_PACK_IDS,
  extractStepsHit,
  isPerfectScore,
} from '../api/src/utils/stats-utils';

const prisma = new PrismaClient();

// Batch size for paginating through plays
const PLAY_BATCH_SIZE = 1000;

// Session gap threshold (2 hours in milliseconds)
const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

// Minimum session requirements
const MIN_PLAYS_PER_SESSION = 2;
const MIN_SESSION_DURATION_MS = 3 * 60 * 1000; // 3 minutes

async function backfillUserStats(targetUserId?: string): Promise<void> {
  if (targetUserId) {
    console.log(`Backfilling user stats for user: ${targetUserId}\n`);
  } else {
    console.log('Backfilling user stats for all users...\n');
  }

  const startTime = Date.now();

  // Build WHERE clause conditionally
  const whereClause = targetUserId ? Prisma.sql`WHERE "userId" = ${targetUserId}` : Prisma.empty;

  // Get play counts and unique charts for users
  const userStats = await prisma.$queryRaw<Array<{ user_id: string; play_count: bigint; charts_played: bigint }>>`
    SELECT 
      "userId" as user_id, 
      COUNT(*) as play_count,
      COUNT(DISTINCT "chartHash") as charts_played
    FROM "Play"
    ${whereClause}
    GROUP BY "userId"
  `;

  console.log(`Found ${userStats.length} users with plays\n`);

  // Calculate stepsHit and heatMap for each user
  console.log('Calculating stepsHit and heatMap from play data...\n');

  for (const { user_id, play_count, charts_played } of userStats) {
    const totalPlays = Number(play_count);
    const chartsPlayed = Number(charts_played);

    // Fetch user's timezone preference (fallback to UTC)
    const user = await prisma.user.findUnique({
      where: { id: user_id },
      select: { timezone: true },
    });
    const userTimezone = user?.timezone || 'UTC';
    console.log(`Processing user ${user_id}: totalPlays=${totalPlays}, chartsPlayed=${chartsPlayed}, timezone=${userTimezone}`);

    // Page through ITG leaderboard entries for this user's plays (for stepsHit)
    let stepsHit = 0;
    let quads = 0;
    let quints = 0;
    let hexes = 0;
    let cursor: number | undefined;
    let batchCount = 0;

    while (true) {
      // Fetch plays with all leaderboard data and chart info for perfect score detection
      const plays = await prisma.play.findMany({
        where: {
          userId: user_id,
        },
        select: {
          id: true,
          chart: {
            select: {
              meter: true,
              simfileId: true,
              simfiles: { select: { simfile: { select: { packId: true } } } },
            },
          },
          PlayLeaderboard: {
            select: { leaderboardId: true, data: true },
          },
        },
        orderBy: { id: 'asc' },
        take: PLAY_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (plays.length === 0) break;

      batchCount++;
      for (const play of plays) {
        const itgData = play.PlayLeaderboard.find((pl) => pl.leaderboardId === ITG_LEADERBOARD_ID)?.data;
        const playStepsHit = extractStepsHit(itgData);
        stepsHit += playStepsHit;

        // Check if this play qualifies as a quad/quint/hex
        const chartPackIds = play.chart?.simfiles?.map((sc) => sc.simfile.packId) ?? [];
        const chartInPack = chartPackIds.length > 0;
        const chartInExcludedPack = chartPackIds.some((id) => EXCLUDED_PACK_IDS.includes(id));
        const meterOk = play.chart?.meter != null && play.chart.meter <= MAX_METER_FOR_PERFECT_SCORES;
        const enoughSteps = playStepsHit >= MIN_STEPS_FOR_PERFECT_SCORES;

        if (chartInPack && !chartInExcludedPack && meterOk && enoughSteps) {
          if (isPerfectScore(itgData)) quads++;
          const exData = play.PlayLeaderboard.find((pl) => pl.leaderboardId === EX_LEADERBOARD_ID)?.data;
          if (isPerfectScore(exData)) quints++;
          const hexData = play.PlayLeaderboard.find((pl) => pl.leaderboardId === HARD_EX_LEADERBOARD_ID)?.data;
          if (isPerfectScore(hexData)) hexes++;
        }
      }

      cursor = plays[plays.length - 1].id;

      if (plays.length < PLAY_BATCH_SIZE) break;
    }

    // Calculate heatMap from play dates (in user's timezone)
    const heatMapData = await prisma.$queryRaw<Array<{ play_date: string; play_count: bigint }>>`
      SELECT 
        TO_CHAR("createdAt" AT TIME ZONE ${userTimezone}, 'YYYY-MM-DD') as play_date,
        COUNT(*) as play_count
      FROM "Play"
      WHERE "userId" = ${user_id}
      GROUP BY play_date
      ORDER BY play_date
    `;

    const heatMap: Record<string, number> = {};
    for (const { play_date, play_count: count } of heatMapData) {
      heatMap[play_date] = Number(count);
    }

    await prisma.user.update({
      where: { id: user_id },
      data: {
        stats: {
          totalPlays,
          chartsPlayed,
          stepsHit,
          heatMap,
          quads,
          quints,
          hexes,
        } as any,
      },
    });
    console.log(
      `Updated user ${user_id}: totalPlays=${totalPlays}, chartsPlayed=${chartsPlayed}, stepsHit=${stepsHit}, quads=${quads}, quints=${quints}, hexes=${hexes}, heatMapDays=${Object.keys(heatMap).length}, timezone=${userTimezone} (${batchCount} batches)`,
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${elapsed}s`);
  console.log(`Updated ${userStats.length} users`);
}

interface PlayWithLeaderboard {
  id: number;
  chartHash: string;
  createdAt: Date;
  stepsHit: number;
  meter: number | null;
}

interface SessionData {
  startedAt: Date;
  endedAt: Date;
  playCount: number;
  distinctCharts: number;
  stepsHit: number;
  difficultyDistribution: Record<string, number>;
}

/**
 * Backfill user sessions from play history.
 * Sessions are defined as periods of activity separated by 2+ hour gaps.
 * This function preserves existing session IDs where possible by matching
 * on timestamp overlap, updating existing sessions and only creating new ones
 * when no match is found.
 */
async function backfillUserSessions(targetUserId?: string): Promise<void> {
  if (targetUserId) {
    console.log(`\nBackfilling user sessions for user: ${targetUserId}\n`);
  } else {
    console.log('\nBackfilling user sessions for all users...\n');
  }

  const startTime = Date.now();

  // Get list of users with plays
  const whereClause = targetUserId ? Prisma.sql`WHERE "userId" = ${targetUserId}` : Prisma.empty;
  const users = await prisma.$queryRaw<Array<{ user_id: string }>>`
    SELECT DISTINCT "userId" as user_id FROM "Play" ${whereClause}
  `;

  console.log(`Found ${users.length} users with plays\n`);

  let totalSessionsCreated = 0;
  let totalSessionsUpdated = 0;
  let totalSessionsDeleted = 0;

  for (const { user_id } of users) {
    // Fetch existing sessions for this user
    const existingSessions = await prisma.userSession.findMany({
      where: { userId: user_id },
      orderBy: { startedAt: 'asc' },
    });

    // Fetch all plays for this user with ITG leaderboard data, ordered by time
    const plays: PlayWithLeaderboard[] = [];
    let cursor: number | undefined;

    while (true) {
      const batch = await prisma.play.findMany({
        where: { userId: user_id },
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
        take: PLAY_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (batch.length === 0) break;

      for (const play of batch) {
        const stepsHit = extractStepsHit(play.PlayLeaderboard[0]?.data);
        plays.push({
          id: play.id,
          chartHash: play.chartHash,
          createdAt: play.createdAt,
          stepsHit,
          meter: play.chart?.meter ?? null,
        });
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < PLAY_BATCH_SIZE) break;
    }

    if (plays.length === 0) continue;

    // Group plays into sessions based on 2-hour gaps
    const sessions: SessionData[] = [];
    let currentSession: {
      plays: PlayWithLeaderboard[];
      chartHashes: Set<string>;
    } | null = null;

    for (const play of plays) {
      if (!currentSession) {
        // Start first session
        currentSession = {
          plays: [play],
          chartHashes: new Set([play.chartHash]),
        };
      } else {
        const lastPlay = currentSession.plays[currentSession.plays.length - 1];
        const gap = play.createdAt.getTime() - lastPlay.createdAt.getTime();

        if (gap >= SESSION_GAP_MS) {
          // Gap exceeded, finalize current session and start new one
          const sessionData = finalizeSession(currentSession);
          if (sessionData) {
            sessions.push(sessionData);
          }
          currentSession = {
            plays: [play],
            chartHashes: new Set([play.chartHash]),
          };
        } else {
          // Continue current session
          currentSession.plays.push(play);
          currentSession.chartHashes.add(play.chartHash);
        }
      }
    }

    // Finalize last session
    if (currentSession) {
      const sessionData = finalizeSession(currentSession);
      if (sessionData) {
        sessions.push(sessionData);
      }
    }

    // Match computed sessions to existing sessions and update/create as needed
    // A session matches if there's any timestamp overlap (plays from the existing session
    // would fall within the computed session's time range)
    const matchedExistingIds = new Set<number>();
    let userCreated = 0;
    let userUpdated = 0;

    for (const session of sessions) {
      // Find an existing session that overlaps with this computed session
      // Overlap: existing.startedAt <= session.endedAt AND existing.endedAt >= session.startedAt
      const matchingExisting = existingSessions.find(
        (existing) =>
          !matchedExistingIds.has(existing.id) &&
          existing.startedAt.getTime() <= session.endedAt.getTime() &&
          existing.endedAt.getTime() >= session.startedAt.getTime(),
      );

      if (matchingExisting) {
        // Update existing session
        matchedExistingIds.add(matchingExisting.id);
        await prisma.userSession.update({
          where: { id: matchingExisting.id },
          data: {
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            playCount: session.playCount,
            distinctCharts: session.distinctCharts,
            stepsHit: session.stepsHit,
            difficultyDistribution: session.difficultyDistribution,
          },
        });
        userUpdated++;
        totalSessionsUpdated++;
      } else {
        // Create new session
        await prisma.userSession.create({
          data: {
            userId: user_id,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            playCount: session.playCount,
            distinctCharts: session.distinctCharts,
            stepsHit: session.stepsHit,
            difficultyDistribution: session.difficultyDistribution,
          },
        });
        userCreated++;
        totalSessionsCreated++;
      }
    }

    // Delete unmatched existing sessions (sessions that no longer have plays)
    const unmatchedIds = existingSessions.filter((s) => !matchedExistingIds.has(s.id)).map((s) => s.id);

    if (unmatchedIds.length > 0) {
      await prisma.userSession.deleteMany({
        where: { id: { in: unmatchedIds } },
      });
      totalSessionsDeleted += unmatchedIds.length;
    }

    console.log(
      `User ${user_id}: ${plays.length} plays -> ${sessions.length} sessions (created: ${userCreated}, updated: ${userUpdated}, deleted: ${unmatchedIds.length})`,
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nSessions backfill completed in ${elapsed}s`);
  console.log(`Sessions: ${totalSessionsCreated} created, ${totalSessionsUpdated} updated, ${totalSessionsDeleted} deleted for ${users.length} users`);
}

/**
 * Finalize a session, applying minimum requirements filter.
 * Returns null if session doesn't meet minimum requirements.
 */
function finalizeSession(session: { plays: PlayWithLeaderboard[]; chartHashes: Set<string> }): SessionData | null {
  const { plays, chartHashes } = session;

  if (plays.length < MIN_PLAYS_PER_SESSION) {
    return null;
  }

  const startedAt = plays[0].createdAt;
  const endedAt = plays[plays.length - 1].createdAt;
  const duration = endedAt.getTime() - startedAt.getTime();

  if (duration < MIN_SESSION_DURATION_MS) {
    return null;
  }

  const stepsHit = plays.reduce((sum, p) => sum + p.stepsHit, 0);

  // Calculate difficulty distribution
  const difficultyDistribution: Record<string, number> = {};
  for (const play of plays) {
    if (play.meter !== null) {
      const meterKey = String(play.meter);
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

async function main(): Promise<void> {
  // Parse --user=<userId> argument
  const userArg = process.argv.find((arg) => arg.startsWith('--user='));
  const targetUserId = userArg ? userArg.split('=')[1] : undefined;

  try {
    await backfillUserStats(targetUserId);
    await backfillUserSessions(targetUserId);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
