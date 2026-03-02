import type { AuthenticatedRouteHandler, AuthenticatedEvent, RouteHandler, ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { PrismaClient } from '../../prisma/generated';
import { z } from 'zod';
import { respond } from '../utils/responses';
import { DEFAULT_LEADERBOARDS } from '../utils/leaderboard';
import {
  isBlueShiftChart,
  calculatePointsForRank,
  calculatePointsForRankSteppedConservative,
  BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID,
} from '../utils/events/blueshift';

type LeaderboardResponse = {
  hash: string;
  leaderboards: {
    // Keep type for client display, but selection is now by id
    type: string;
    id?: number;
    scores: {
      rank: string;
      score: string;
      grade: string;
      alias: string;
      userId: string; // Add user ID for profile linking
      date: string;
      playId?: number;
      isSelf?: boolean;
      isRival?: boolean;
    }[];
    page?: number;
    perPage?: number;
    hasNext?: boolean;
    total?: number;
    totalPages?: number;
  }[];
  blueShiftLeaderboards?: {
    [leaderboardType: string]: {
      scores: {
        rank: number;
        score: string;
        grade: string;
        alias: string;
        userId: string;
        date: string;
        playId?: number;
        points: number;
        isSelf?: boolean;
        isRival?: boolean;
      }[];
    };
  };
};

// Accept bigint or number from the database layer; normalize to number
const BigIntOrNumberToNumber = z.union([z.bigint(), z.number()]).transform((val) => (typeof val === 'bigint' ? Number(val) : val));

const LeaderboardEntrySchema = z.object({
  rank: BigIntOrNumberToNumber,
  data: z.any(), // JSON data from the leaderboard
  userAlias: z.string(),
  userId: z.string(), // Add user ID for profile linking
  leaderboardType: z.string(),
  date: z.date(),
  playId: BigIntOrNumberToNumber,
});

type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

/**
 * Get leaderboard IDs for the active Blue Shift phase
 */
function getBlueShiftLeaderboardIds(phaseNumber: 1 | 2 | 3): number[] {
  switch (phaseNumber) {
    case 1:
      return [BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID];
    case 2:
      return [BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID];
    case 3:
      return [BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID];
  }
}

// Determine which point calculator to use based on leaderboard ID
function getPointCalculatorForLeaderboard(leaderboardId: number): (rank: number) => number {
  const phase1Ids = getBlueShiftLeaderboardIds(1);
  const phase2Ids = getBlueShiftLeaderboardIds(2);
  const phase3Ids = getBlueShiftLeaderboardIds(3);

  if (phase1Ids.includes(leaderboardId)) {
    // Phase 1 uses exponential decay
    return calculatePointsForRank;
  } else if (phase2Ids.includes(leaderboardId) || phase3Ids.includes(leaderboardId)) {
    // Phase 2 and 3 use stepped conservative
    return calculatePointsForRankSteppedConservative;
  }

  // Default to exponential
  return calculatePointsForRank;
}

// Fetch blue shift leaderboard data for a specific chart
// Fetches leaderboards from all phases that this chart participated in
const fetchBlueShiftLeaderboardData = async (
  chartHash: string,
  prisma: PrismaClient,
  currentUserId?: string,
  rivalUserIds?: string[],
): Promise<LeaderboardResponse['blueShiftLeaderboards']> => {
  const blueShiftLeaderboards: LeaderboardResponse['blueShiftLeaderboards'] = {};

  // Collect all phase leaderboard IDs to check
  const allPhaseLeaderboardIds = [...getBlueShiftLeaderboardIds(1), ...getBlueShiftLeaderboardIds(2), ...getBlueShiftLeaderboardIds(3)];

  for (const leaderboardId of allPhaseLeaderboardIds) {
    const rawResults = await prisma.$queryRaw`
      WITH ranked AS (
        SELECT
          pl.data,
          u.alias AS "userAlias",
          u.id    AS "userId",
          l.type  AS "leaderboardType",
          p."createdAt" AS "date",
          p.id AS "playId",
          pl."sortKey",
          (pl.data->>'score')::decimal AS score,
          ROW_NUMBER() OVER (
            PARTITION BY p."userId"
            ORDER BY pl."sortKey" DESC, p."createdAt" DESC, p.id DESC
          ) AS rn
        FROM "PlayLeaderboard" pl
        JOIN "Play"        p ON pl."playId" = p.id
        JOIN "User"        u ON p."userId" = u.id
        JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
        WHERE p."chartHash" = ${chartHash}
          AND l.id = ${leaderboardId}
      )
      SELECT
        RANK() OVER (ORDER BY score DESC) AS rank,
        data,
        "userAlias",
        "userId",
        "leaderboardType",
        "date",
        "playId"
      FROM ranked
      WHERE rn = 1
      ORDER BY score DESC
    `;

    const playLeaderboards: LeaderboardEntry[] = z.array(LeaderboardEntrySchema).parse(rawResults);

    if (playLeaderboards.length > 0) {
      const leaderboardType = playLeaderboards[0].leaderboardType;
      const pointCalculator = getPointCalculatorForLeaderboard(leaderboardId);

      blueShiftLeaderboards[leaderboardType] = {
        scores: playLeaderboards.map((entry) => ({
          rank: entry.rank,
          score: entry.data.score,
          grade: entry.data.grade || 'n/a',
          alias: entry.userAlias,
          userId: entry.userId,
          date: entry.date.toISOString(),
          playId: entry.playId,
          points: pointCalculator(entry.rank),
          isSelf: currentUserId ? entry.userId === currentUserId : false,
          isRival: rivalUserIds ? rivalUserIds.includes(entry.userId) : false,
        })),
      };
    }
  }

  return Object.keys(blueShiftLeaderboards).length > 0 ? blueShiftLeaderboards : undefined;
};

// Shared function to fetch leaderboard data (types to include supplied by caller)
const fetchLeaderboardData = async (
  chartHash: string,
  prisma: PrismaClient,
  leaderboardIds: number[],
  userAlias?: string,
  options?: { page?: number; perPage?: number; currentUserId?: string; rivalUserIds?: string[] },
): Promise<LeaderboardResponse> => {
  const chart = await prisma.chart.findFirst({
    where: {
      hash: chartHash,
    },
  });

  if (!chart) {
    throw new Error('Chart not found');
  }

  const logPrefix = userAlias ? `user ${userAlias}` : 'anonymous user';
  console.log(`Received leaderboard request from ${logPrefix} for chartHash ${chartHash}`);
  console.log(`Found chart: ${chart.artist} - ${chart.songName} [${chart.rating}] [${chart.length}] (credit: ${chart.stepartist || 'unknown'})`);

  const response: LeaderboardResponse = {
    hash: chartHash,
    leaderboards: [],
  };

  // Add blue shift leaderboards if this is a blue shift chart
  if (isBlueShiftChart(chartHash)) {
    response.blueShiftLeaderboards = await fetchBlueShiftLeaderboardData(chartHash, prisma, options?.currentUserId, options?.rivalUserIds);
  }

  // todo: consider TypedSQL instead of zod for typing
  for (const leaderboardId of leaderboardIds) {
    const perPage = options?.perPage && options.perPage > 0 ? options.perPage : 5;
    const page = options?.page && options.page > 0 ? options.page : 1;
    const offset = (page - 1) * perPage;

    // Fetch one extra to detect hasNext
    const rawResults = await prisma.$queryRaw`
      WITH ranked AS (
        SELECT
          pl.data,
          u.alias AS "userAlias",
          u.id    AS "userId",
          l.type  AS "leaderboardType",
          p."createdAt" AS "date",
          p.id AS "playId",
          pl."sortKey",
          ROW_NUMBER() OVER (
            PARTITION BY p."userId"
            ORDER BY pl."sortKey" DESC, p."createdAt" DESC, p.id DESC
          ) AS rn
        FROM "PlayLeaderboard" pl
        JOIN "Play"        p ON pl."playId" = p.id
        JOIN "User"        u ON p."userId" = u.id
        JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
        WHERE p."chartHash" = ${chartHash}
          AND l.id = ${leaderboardId}
      )
      SELECT
        ROW_NUMBER() OVER (ORDER BY "sortKey" DESC) AS rank,
        data,
        "userAlias",
        "userId",
        "leaderboardType",
        "date",
        "playId"
      FROM ranked
      WHERE rn = 1
      ORDER BY "sortKey" DESC
      OFFSET ${offset}
      LIMIT ${perPage + 1}
    `;

    const playLeaderboards: LeaderboardEntry[] = z.array(LeaderboardEntrySchema).parse(rawResults);
    const hasNext = playLeaderboards.length > perPage;
    const pageItems = hasNext ? playLeaderboards.slice(0, perPage) : playLeaderboards;

    // Total distinct users with scores for this chart and leaderboard type
    const totalRows = await prisma.$queryRaw<[{ count: bigint | number }]>`
      SELECT COUNT(DISTINCT p."userId")::bigint AS "count"
      FROM "PlayLeaderboard" pl
      JOIN "Play"        p ON pl."playId" = p.id
      JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
      WHERE p."chartHash" = ${chartHash}
        AND l.id = ${leaderboardId}
    `;
    const total = BigIntOrNumberToNumber.parse(totalRows?.[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    response.leaderboards.push({
      type: (rawResults as any)?.[0]?.leaderboardType ?? 'unknown',
      id: leaderboardId,
      scores: pageItems.map((entry) => ({
        rank: entry.rank.toString(),
        score: entry.data.score,
        grade: entry.data.grade || 'n/a',
        alias: entry.userAlias,
        userId: entry.userId, // Include user ID for profile linking
        date: entry.date.toISOString(),
        playId: entry.playId,
        isSelf: options?.currentUserId ? entry.userId === options.currentUserId : false,
        isRival: options?.rivalUserIds ? options.rivalUserIds.includes(entry.userId) : false,
      })),
      page,
      perPage,
      hasNext: page < totalPages,
      total,
      totalPages,
    });
  }

  return response;
};

// Authenticated handler (for API routes requiring auth)
// Default types if user has no preferences or an error occurs resolving them
// Selection defaults now driven by IDs

import { getUserPreferredLeaderboardIds } from '../services/userPreferredLeaderboards';

export const getLeaderboardsForChart: AuthenticatedRouteHandler = async (event: AuthenticatedEvent, prisma: PrismaClient) => {
  if (!event.routeParameters?.chartHash) {
    return respond(400, { error: 'Missing chartHash in route parameters' });
  }

  try {
    // Resolve preferred leaderboard ids for this user
    let ids: number[] = DEFAULT_LEADERBOARDS;
    try {
      const prefIds = await getUserPreferredLeaderboardIds(prisma, event.user.id);
      if (prefIds.length) {
        // Ensure stable ordering by id ascending
        const rows = await prisma.leaderboard.findMany({
          where: { id: { in: prefIds } },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        const resolvedIds: number[] = rows.map((r) => r.id);
        if (resolvedIds.length) ids = resolvedIds;
      }
    } catch (e) {
      console.warn('Failed to resolve preferred leaderboards; falling back to defaults', e);
    }

    const chartHash = event.routeParameters.chartHash;
    const limitParam = event.queryStringParameters?.limit;
    const MIN_SIZE = limitParam ? Math.min(20, Math.max(5, parseInt(limitParam, 10) || 7)) : 7;

    // Build response per leaderboard type
    const leaderboards = [] as LeaderboardResponse['leaderboards'];

    // Load user's rivals once to compute flags
    const rivalRows = await prisma.userRival.findMany({ where: { userId: event.user.id }, select: { rivalUserId: true } });
    const rivalSet = new Set<string>(rivalRows.map((r) => r.rivalUserId));

    const leaderboardResults = await Promise.all(
      ids.map(async (leaderboardId) => {
        const rivalArray = Array.from(rivalSet.values());
        const TOP_FETCH_LIMIT = MIN_SIZE * 4;
        const consolidatedRows = await prisma.$queryRawUnsafe<any[]>(
          `
          WITH ranked AS (
            SELECT
              pl.data,
              u.alias AS "userAlias",
              u.id    AS "userId",
              l.type  AS "leaderboardType",
              p."createdAt" AS "date",
              p.id AS "playId",
              pl."sortKey",
              ROW_NUMBER() OVER (
                PARTITION BY p."userId"
                ORDER BY pl."sortKey" DESC, p."createdAt" DESC, p.id DESC
              ) AS rn
            FROM "PlayLeaderboard" pl
            JOIN "Play"        p ON pl."playId" = p.id
            JOIN "User"        u ON p."userId" = u.id
            JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
            WHERE p."chartHash" = $1
              AND l.id = $2
          ), deduped AS (
            SELECT ROW_NUMBER() OVER (ORDER BY "sortKey" DESC) AS rank,
                   data, "userAlias", "userId", "leaderboardType", "date", "playId"
            FROM ranked WHERE rn = 1
          ), user_row AS (
            SELECT rank AS user_rank FROM deduped WHERE "userId" = $3
          ), selected AS (
            SELECT * FROM deduped
            WHERE rank <= $4
               OR "userId" = $3
               ${rivalArray.length ? `OR "userId" IN (${rivalArray.map((_, i) => `$${5 + i}`).join(',')})` : ''}
               OR (
                  (SELECT user_rank FROM user_row) IS NOT NULL
                  AND rank BETWEEN (SELECT user_rank FROM user_row)-1 AND (SELECT user_rank FROM user_row)+1
               )
          )
          SELECT (SELECT COUNT(*) FROM deduped) AS total_users,
                 (SELECT user_rank FROM user_row) AS user_rank,
                 s.*
          FROM selected s
          ORDER BY rank ASC;
        `,
          ...[chartHash, leaderboardId, event.user.id, TOP_FETCH_LIMIT, ...rivalArray],
        );

        const total = consolidatedRows.length ? BigIntOrNumberToNumber.parse(consolidatedRows[0].total_users) : 0;
        const totalPages = Math.max(1, Math.ceil(total / MIN_SIZE));
        const userRank =
          consolidatedRows.length && consolidatedRows[0].user_rank != null ? BigIntOrNumberToNumber.parse(consolidatedRows[0].user_rank) : undefined;

        const parsedRows: LeaderboardEntry[] = z.array(LeaderboardEntrySchema).parse(
          consolidatedRows.map((r) => ({
            rank: r.rank,
            data: r.data,
            userAlias: r.userAlias,
            userId: r.userId,
            leaderboardType: r.leaderboardType,
            date: new Date(r.date),
            playId: r.playId,
          })),
        );

        const top2Entries = parsedRows.filter((r) => BigIntOrNumberToNumber.parse(r.rank as any) <= 2);
        const userEntry = userRank != null ? parsedRows.find((r) => BigIntOrNumberToNumber.parse(r.rank as any) === userRank) : undefined;
        const neighborPrev = userRank != null ? parsedRows.find((r) => BigIntOrNumberToNumber.parse(r.rank as any) === userRank - 1) : undefined;
        const neighborNext = userRank != null ? parsedRows.find((r) => BigIntOrNumberToNumber.parse(r.rank as any) === userRank + 1) : undefined;
        const rivalRowsFiltered = parsedRows
          .filter((r) => rivalSet.has(r.userId))
          .sort((a, b) => BigIntOrNumberToNumber.parse(a.rank as any) - BigIntOrNumberToNumber.parse(b.rank as any));
        const topRivalEntry = rivalRowsFiltered[0];
        let nearestRivalEntry: LeaderboardEntry | undefined;
        if (userRank != null && rivalRowsFiltered.length) {
          let best: { e: LeaderboardEntry; dist: number } | undefined;
          for (const e of rivalRowsFiltered) {
            const rnk = BigIntOrNumberToNumber.parse(e.rank as any);
            const dist = Math.abs(rnk - userRank);
            if (!best || dist < best.dist || (dist === best.dist && rnk < BigIntOrNumberToNumber.parse(best.e.rank as any))) {
              best = { e, dist };
            }
          }
          if (best) {
            if (topRivalEntry && best.e.userId === topRivalEntry.userId && rivalRowsFiltered.length > 1) {
              nearestRivalEntry = rivalRowsFiltered[1];
            } else {
              nearestRivalEntry = best.e;
            }
          }
        } else if (rivalRowsFiltered.length > 1) {
          nearestRivalEntry = rivalRowsFiltered[1];
        }

        // Merge and dedupe by userId keeping best rank; must-haves per spec
        const byUser = new Map<string, LeaderboardEntry>();
        const addEntries = (arr: LeaderboardEntry[]) => {
          for (const e of arr) {
            const existing = byUser.get(e.userId);
            if (!existing || BigIntOrNumberToNumber.parse(e.rank as any) < BigIntOrNumberToNumber.parse(existing.rank as any)) {
              byUser.set(e.userId, e);
            }
          }
        };
        addEntries(top2Entries);
        if (userEntry) addEntries([userEntry]);
        if (neighborPrev) addEntries([neighborPrev]);
        if (neighborNext) addEntries([neighborNext]);
        if (topRivalEntry) addEntries([topRivalEntry]);
        if (nearestRivalEntry) addEntries([nearestRivalEntry]);

        // If still below MIN_SIZE, fill from already fetched parsedRows (they include top slice & rivals & neighbors)
        if (byUser.size < MIN_SIZE && parsedRows.length) {
          for (const row of parsedRows) {
            if (byUser.size >= MIN_SIZE) break;
            const existing = byUser.get(row.userId);
            if (!existing) byUser.set(row.userId, row);
          }
        }

        // Build final sorted list by rank and trim to exactly MIN_SIZE while preserving must-haves
        const merged = Array.from(byUser.values()).sort((a, b) => BigIntOrNumberToNumber.parse(a.rank as any) - BigIntOrNumberToNumber.parse(b.rank as any));
        const mustHaveIds = new Set<string>([
          ...top2Entries.map((e) => e.userId),
          ...(topRivalEntry ? [topRivalEntry.userId] : []),
          ...(userEntry ? [userEntry.userId] : []),
          ...(neighborPrev ? [neighborPrev.userId] : []),
          ...(neighborNext ? [neighborNext.userId] : []),
          ...(nearestRivalEntry ? [nearestRivalEntry.userId] : []),
        ]);
        const mustHaves: LeaderboardEntry[] = merged.filter((e) => mustHaveIds.has(e.userId));
        let optional: LeaderboardEntry[] = merged.filter((e) => !mustHaveIds.has(e.userId));
        if (userRank != null) {
          // Prefer entries closest to the user's rank
          optional = optional.sort((a, b) => {
            const ra = BigIntOrNumberToNumber.parse(a.rank as any);
            const rb = BigIntOrNumberToNumber.parse(b.rank as any);
            const da = Math.abs(ra - userRank);
            const db = Math.abs(rb - userRank);
            if (da !== db) return da - db;
            return ra - rb;
          });
        }
        const finalItems: LeaderboardEntry[] = [];
        for (const e of mustHaves) {
          if (!finalItems.find((x) => x.userId === e.userId)) finalItems.push(e);
        }
        for (const e of optional) {
          if (finalItems.length >= MIN_SIZE) break;
          finalItems.push(e);
        }

        // Ensure final output is sorted by rank ascending
        const finalSorted = finalItems.sort((a, b) => BigIntOrNumberToNumber.parse(a.rank as any) - BigIntOrNumberToNumber.parse(b.rank as any));

        return {
          type: (consolidatedRows as any)?.[0]?.leaderboardType ?? 'unknown',
          id: leaderboardId,
          scores: finalSorted.map((entry) => ({
            rank: entry.rank.toString(),
            score: entry.data.score,
            grade: entry.data.grade || 'n/a',
            alias: entry.userAlias,
            userId: entry.userId,
            date: entry.date.toISOString(),
            playId: entry.playId,
            isSelf: entry.userId === event.user.id,
            isRival: rivalSet.has(entry.userId),
          })),
          page: 1,
          perPage: MIN_SIZE,
          hasNext: total > MIN_SIZE,
          total,
          totalPages,
        } as LeaderboardResponse['leaderboards'][number];
      }),
    );

    leaderboards.push(...leaderboardResults);

    // Add blue shift leaderboards if this is a blue shift chart
    const response: LeaderboardResponse = { hash: chartHash, leaderboards };
    if (isBlueShiftChart(chartHash)) {
      const rivalArray = Array.from(rivalSet.values());
      const blueShiftData = await fetchBlueShiftLeaderboardData(chartHash, prisma, event.user.id, rivalArray);
      if (blueShiftData) {
        response.blueShiftLeaderboards = blueShiftData;
      }
    }

    return respond(200, response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Chart not found') {
      console.error(`Chart with hash ${event.routeParameters.chartHash} not found`);
      return respond(404, { error: 'Chart not found' });
    }
    console.error('Error fetching leaderboards:', error);
    return respond(500, { error: 'Internal server error' });
  }
};

// Unauthenticated handler (for web routes accessible without auth)
export const getLeaderboardsForChartPublic: RouteHandler = async (event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient) => {
  if (!event.routeParameters?.chartHash) {
    return respond(400, { error: 'Missing chartHash in route parameters' });
  }

  try {
    // Public route: paginated, 25 per page
    // user alias is undefined for now
    const pageParam = event.queryStringParameters?.page;
    const page = pageParam ? Math.max(parseInt(pageParam, 10) || 1, 1) : 1;
    const response = await fetchLeaderboardData(event.routeParameters.chartHash, prisma, DEFAULT_LEADERBOARDS, undefined, {
      page,
      perPage: 25,
    });

    // Add blue shift leaderboards if this is a blue shift chart
    if (isBlueShiftChart(event.routeParameters.chartHash)) {
      const blueShiftData = await fetchBlueShiftLeaderboardData(event.routeParameters.chartHash, prisma);
      if (blueShiftData) {
        response.blueShiftLeaderboards = blueShiftData;
      }
    }

    return respond(200, response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Chart not found') {
      console.error(`Chart with hash ${event.routeParameters.chartHash} not found`);
      return respond(404, { error: 'Chart not found' });
    }
    console.error('Error fetching leaderboards:', error);
    return respond(500, { error: 'Internal server error' });
  }
};
