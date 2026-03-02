import type { PrismaClient } from '../../prisma/generated/client';
import { EventConfig, EventLeaderboardData, EventLeaderboardEntry, LeaderboardSnapshot, LeaderboardEntry } from '../utils/events/base';
import { z } from 'zod';

/**
 * Service for managing event leaderboards, snapshots, and delta calculations
 */
export class EventLeaderboardService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get current leaderboard state before score submission for delta calculation
   */
  async getLeaderboardSnapshot(chartHash: string, leaderboardIds: number[], event: EventConfig): Promise<Map<number, LeaderboardSnapshot[]>> {
    const snapshots = new Map<number, LeaderboardSnapshot[]>();

    // Execute all leaderboard queries in parallel instead of sequentially
    const snapshotPromises = leaderboardIds.map(async (leaderboardId) => {
      const rawResults = await this.prisma.$queryRaw`
        WITH best_scores AS (
          SELECT DISTINCT ON (p."userId")
            pl.data,
            u.alias as "userAlias",
            u.id as "userId",
            pl."sortKey",
            (pl.data->>'score')::decimal as score
          FROM "PlayLeaderboard" pl
          JOIN "Play" p ON pl."playId" = p.id
          JOIN "User" u ON p."userId" = u.id
          WHERE p."chartHash" = ${chartHash}
            AND pl."leaderboardId" = ${leaderboardId}
          ORDER BY p."userId", pl."sortKey" DESC
        )
        SELECT
          RANK() OVER (ORDER BY score DESC) as rank,
          "userAlias",
          "userId",
          data
        FROM best_scores
        ORDER BY score DESC
      `;

      const entries = z
        .array(
          z.object({
            rank: z.bigint().transform((val) => Number(val)),
            userAlias: z.string(),
            userId: z.string(),
            data: z.any(),
          }),
        )
        .parse(rawResults);

      // Calculate points using the event's point calculation system
      const snapshotEntries = entries.map((entry) => ({
        userId: entry.userId,
        userAlias: entry.userAlias,
        rank: entry.rank,
        points: event.calculatePointsForRank(entry.rank),
        grade: entry.data?.grade || 'F',
      }));

      return { leaderboardId, snapshotEntries };
    });

    // Wait for all queries to complete
    const results = await Promise.all(snapshotPromises);

    // Populate the snapshots map with results
    results.forEach(({ leaderboardId, snapshotEntries }) => {
      snapshots.set(leaderboardId, snapshotEntries);
    });

    return snapshots;
  }

  /**
   * Calculate updated event leaderboards after processing a new score
   */
  async calculateEventLeaderboards(chartHash: string, event: EventConfig, currentUserId: string, rivalUserIds: string[]): Promise<EventLeaderboardData[]> {
    // Pass chartHash to only query the specific chart instead of all event charts
    const entries = await event.getLeaderboardEntries(this.prisma, chartHash);

    // Group entries by leaderboard type (no need to filter by chartHash since we already did)
    const leaderboardsByType = new Map<string, LeaderboardEntry[]>();

    for (const entry of entries) {
      if (!leaderboardsByType.has(entry.leaderboardType)) {
        leaderboardsByType.set(entry.leaderboardType, []);
      }
      leaderboardsByType.get(entry.leaderboardType)!.push(entry);
    }

    const leaderboards: EventLeaderboardData[] = [];
    const MIN_SIZE = 8; // Event leaderboards show 8 rows
    const rivalSet = new Set(rivalUserIds);

    for (const [leaderboardType, typeEntries] of leaderboardsByType) {
      // Sort by rank to ensure correct ordering
      typeEntries.sort((a, b) => a.rank - b.rank);

      // Apply leaderboard selection logic similar to regular leaderboards
      const selectedEntries = this.selectLeaderboardEntries(typeEntries, currentUserId, rivalSet, MIN_SIZE);

      const eventEntries: EventLeaderboardEntry[] = selectedEntries.map((entry) => ({
        rank: entry.rank,
        userId: entry.userId,
        userAlias: entry.userAlias,
        userProfileImageUrl: entry.userProfileImageUrl,
        chartHash: entry.chartHash,
        score: entry.data.score || '0.00',
        grade: entry.data.grade || 'F',
        points: event.calculatePointsForRank(entry.rank),
        delta: 0, // Will be calculated separately
        isSelf: entry.userId === currentUserId,
        isRival: rivalSet.has(entry.userId),
      }));

      // Find the leaderboard ID for this type using proper mapping
      const leaderboardId = event.getLeaderboardIdForType(leaderboardType) || event.leaderboardIds[0];

      leaderboards.push({
        type: leaderboardType,
        leaderboardId,
        entries: eventEntries,
      });
    }

    return leaderboards;
  }

  /**
   * Select leaderboard entries using the same logic as regular leaderboards:
   * - Always show self
   * - Always show top rival
   * - Always show nearest rival
   * - Fill remainder from top of leaderboard
   */
  private selectLeaderboardEntries(allEntries: LeaderboardEntry[], currentUserId: string, rivalSet: Set<string>, minSize: number): LeaderboardEntry[] {
    if (allEntries.length === 0) return [];

    // Find user rank
    const userEntry = allEntries.find((e) => e.userId === currentUserId);
    const userRank = userEntry?.rank;

    // Find rival entries, sorted by rank
    const rivalEntries = allEntries.filter((e) => rivalSet.has(e.userId)).sort((a, b) => a.rank - b.rank);

    const topRivalEntry = rivalEntries[0];
    let nearestRivalEntry: LeaderboardEntry | undefined;

    if (userRank != null && rivalEntries.length) {
      let best: { e: LeaderboardEntry; dist: number } | undefined;
      for (const e of rivalEntries) {
        const dist = Math.abs(e.rank - userRank);
        if (!best || dist < best.dist || (dist === best.dist && e.rank < best.e.rank)) {
          best = { e, dist };
        }
      }
      if (best) {
        if (topRivalEntry && best.e.userId === topRivalEntry.userId && rivalEntries.length > 1) {
          nearestRivalEntry = rivalEntries[1];
        } else {
          nearestRivalEntry = best.e;
        }
      }
    } else if (rivalEntries.length > 1) {
      nearestRivalEntry = rivalEntries[1];
    }

    // Get top 2 entries
    const top2Entries = allEntries.slice(0, 2);

    // Get user neighbors if user has a rank
    const neighborPrev = userRank != null ? allEntries.find((e) => e.rank === userRank - 1) : undefined;
    const neighborNext = userRank != null ? allEntries.find((e) => e.rank === userRank + 1) : undefined;

    // Merge and dedupe by userId keeping best rank
    const byUser = new Map<string, LeaderboardEntry>();
    const addEntries = (arr: (LeaderboardEntry | undefined)[]) => {
      for (const e of arr) {
        if (!e) continue;
        const existing = byUser.get(e.userId);
        if (!existing || e.rank < existing.rank) {
          byUser.set(e.userId, e);
        }
      }
    };

    addEntries(top2Entries);
    addEntries([userEntry]);
    addEntries([neighborPrev, neighborNext]);
    addEntries([topRivalEntry, nearestRivalEntry]);

    // If still below minSize, fill from top entries
    if (byUser.size < minSize && allEntries.length) {
      for (const entry of allEntries) {
        if (byUser.size >= minSize) break;
        if (!byUser.has(entry.userId)) {
          byUser.set(entry.userId, entry);
        }
      }
    }

    // Build final list prioritizing must-haves
    const merged = Array.from(byUser.values()).sort((a, b) => a.rank - b.rank);
    const mustHaveIds = new Set<string>([
      ...top2Entries.map((e) => e.userId),
      ...(topRivalEntry ? [topRivalEntry.userId] : []),
      ...(userEntry ? [userEntry.userId] : []),
      ...(neighborPrev ? [neighborPrev.userId] : []),
      ...(neighborNext ? [neighborNext.userId] : []),
      ...(nearestRivalEntry ? [nearestRivalEntry.userId] : []),
    ]);

    const mustHaves = merged.filter((e) => mustHaveIds.has(e.userId));
    let optional = merged.filter((e) => !mustHaveIds.has(e.userId));

    // Sort optional entries by proximity to user rank if user has rank
    if (userRank != null) {
      optional = optional.sort((a, b) => {
        const distA = Math.abs(a.rank - userRank);
        const distB = Math.abs(b.rank - userRank);
        if (distA !== distB) return distA - distB;
        return a.rank - b.rank;
      });
    }

    // Build final result
    const finalItems: LeaderboardEntry[] = [];

    // Add must-haves first (dedupe by userId)
    for (const e of mustHaves) {
      if (!finalItems.find((x) => x.userId === e.userId)) {
        finalItems.push(e);
      }
    }

    // Fill remaining slots with optional entries
    for (const e of optional) {
      if (finalItems.length >= minSize) break;
      finalItems.push(e);
    }

    // Return sorted by rank
    return finalItems.sort((a, b) => a.rank - b.rank);
  }

  /**
   * Calculate deltas by comparing before/after states
   */
  calculateDeltas(beforeSnapshots: Map<number, LeaderboardSnapshot[]>, afterLeaderboards: EventLeaderboardData[]): EventLeaderboardData[] {
    return afterLeaderboards.map((leaderboard) => {
      // Find the corresponding before snapshot
      const beforeSnapshot = beforeSnapshots.get(leaderboard.leaderboardId) || [];
      const beforeMap = new Map(beforeSnapshot.map((entry) => [entry.userId, entry]));

      const entriesWithDeltas = leaderboard.entries.map((afterEntry) => {
        const beforeEntry = beforeMap.get(afterEntry.userId);

        let delta = 0;
        if (beforeEntry) {
          // User existed before - only show delta if their points actually changed
          // (not just their rank due to other players' movements)
          delta = afterEntry.points - beforeEntry.points;
        } else {
          // New player in the leaderboard view (could be new submission or just newly visible)
          // Only show delta if they're actually new to the leaderboard entirely
          // If they existed before but weren't in the visible snapshot, delta should be 0
          // We can detect this: if someone has points but wasn't in beforeMap,
          // they either just submitted (delta = their points) or were hidden (delta = 0)
          // For now, we'll show the delta as their current points for new entries
          delta = afterEntry.points;
        }

        return {
          ...afterEntry,
          delta,
        };
      });

      return {
        ...leaderboard,
        entries: entriesWithDeltas,
      };
    });
  }

  /**
   * Default point calculation (fallback when event config not available)
   */
  private calculateDefaultPoints(rank: number): number {
    if (rank <= 0) return 0;
    const maxPoints = 10000;
    const decayRate = 0.08;
    const points = maxPoints * Math.exp(-decayRate * (rank - 1));
    return Math.max(1, Math.round(points));
  }

  /**
   * Get comprehensive event leaderboard data with deltas for a chart submission
   */
  async getEventLeaderboardsWithDeltas(
    chartHash: string,
    event: EventConfig,
    beforeSnapshots: Map<number, LeaderboardSnapshot[]>,
    currentUserId: string,
    rivalUserIds: string[],
  ): Promise<EventLeaderboardData[]> {
    const afterLeaderboards = await this.calculateEventLeaderboards(chartHash, event, currentUserId, rivalUserIds);
    return this.calculateDeltas(beforeSnapshots, afterLeaderboards);
  }
}
