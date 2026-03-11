import type { PrismaClient } from '../../prisma/generated/client';
import { GLOBAL_HARD_EX_LEADERBOARD_ID, GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID } from './leaderboard';
import { assetS3UrlToCloudFrontUrl } from './s3';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The difficulty slots we compute pack leaderboards for. */
export const PACK_LEADERBOARD_DIFFICULTIES = ['medium', 'hard', 'challenge'] as const;
export type PackLeaderboardDifficulty = (typeof PACK_LEADERBOARD_DIFFICULTIES)[number];

/** Scoring system label → global Leaderboard row id mapping. */
export const SCORING_SYSTEMS = {
  HardEX: GLOBAL_HARD_EX_LEADERBOARD_ID,
  EX: GLOBAL_EX_LEADERBOARD_ID,
  ITG: GLOBAL_MONEY_LEADERBOARD_ID,
} as const;
export type ScoringSystemKey = keyof typeof SCORING_SYSTEMS;
export const SCORING_SYSTEM_KEYS = Object.keys(SCORING_SYSTEMS) as ScoringSystemKey[];

/** A single ranking entry (references a user id in the users dictionary). */
export interface PackLeaderboardRanking {
  rank: number;
  userId: string;
  totalScore: number;
  chartsPlayed: number;
}

/** Per-scoring-system leaderboard. */
export interface PackScoringLeaderboard {
  totalParticipants: number;
  rankings: PackLeaderboardRanking[];
}

/** The full output structure, JSON-optimised with a users dictionary. */
export interface PackLeaderboardOutput {
  generatedAt: string;
  packId: number;
  packName: string;
  /** De-duplicated user lookup: userId → { alias, profileImageUrl } */
  users: Record<string, { alias: string; profileImageUrl: string | null }>;
  /** difficulty → scoringSystem → leaderboard */
  leaderboards: Record<string, Record<string, PackScoringLeaderboard>>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Curved point buckets for converting a percentage score (0-100) to points.
 * Each bucket defines a score range and the points awarded for fully
 * completing that range. Partial completion awards proportional points.
 * Maximum possible points per chart: 1000.
 */
const POINT_BUCKETS: { min: number; max: number; points: number }[] = [
  { min: 0, max: 80, points: 200 },
  { min: 80, max: 85, points: 100 },
  { min: 85, max: 90, points: 100 },
  { min: 90, max: 92, points: 100 },
  { min: 92, max: 94, points: 100 },
  { min: 94, max: 96, points: 100 },
  { min: 96, max: 98, points: 100 },
  { min: 98, max: 99, points: 100 },
  { min: 99, max: 100, points: 100 },
];

/**
 * Convert a percentage score (0–100) to curved points using the bucket system.
 * Full buckets below the score are awarded entirely; the bucket containing
 * the score awards a proportional amount.
 */
export function scoreToCurvedPoints(score: number): number {
  let points = 0;
  for (const bucket of POINT_BUCKETS) {
    if (score <= bucket.min) break;
    const range = bucket.max - bucket.min;
    const progress = Math.min(score, bucket.max) - bucket.min;
    points += (progress / range) * bucket.points;
  }
  return points;
}

interface BestScoreRow {
  userId: string;
  userAlias: string;
  userProfileImageUrl: string | null;
  chartHash: string;
  leaderboardId: number;
  score: number;
}

/**
 * For a given set of chart hashes and leaderboard IDs, fetch each user's single
 * best score per chart per leaderboard. "Best" is determined by the PlayLeaderboard
 * sortKey (DESC) which already encodes score + tie-break.
 */
async function getBestScoresForCharts(prisma: PrismaClient, chartHashes: string[], leaderboardIds: number[]): Promise<BestScoreRow[]> {
  if (chartHashes.length === 0) return [];

  const rows: any[] = await prisma.$queryRaw`
    SELECT DISTINCT ON (p."userId", p."chartHash", pl."leaderboardId")
      p."userId"               AS "userId",
      u.alias                  AS "userAlias",
      u."profileImageUrl"      AS "userProfileImageUrl",
      p."chartHash"            AS "chartHash",
      pl."leaderboardId"       AS "leaderboardId",
      (pl.data->>'score')::double precision AS score
    FROM "PlayLeaderboard" pl
    JOIN "Play" p  ON pl."playId" = p.id
    JOIN "User" u  ON p."userId" = u.id
    WHERE p."chartHash" = ANY(${chartHashes})
      AND pl."leaderboardId" = ANY(${leaderboardIds})
      AND u.banned = false
      AND u."shadowBanned" = false
    ORDER BY p."userId", p."chartHash", pl."leaderboardId", pl."sortKey" DESC
  `;

  return rows.map((r) => ({
    userId: r.userId,
    userAlias: r.userAlias,
    userProfileImageUrl: r.userProfileImageUrl,
    chartHash: r.chartHash,
    leaderboardId: Number(r.leaderboardId),
    score: Number(r.score),
  }));
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Calculate pack leaderboards for a single pack.
 *
 * Returns a fully-serialisable {@link PackLeaderboardOutput} containing 9
 * leaderboards (3 difficulties × 3 scoring systems) with a de-duplicated
 * users dictionary.
 */
export async function calculatePackLeaderboards(prisma: PrismaClient, packId: number): Promise<PackLeaderboardOutput> {
  // 1. Fetch pack info
  const pack = await prisma.pack.findUniqueOrThrow({
    where: { id: packId },
    select: { id: true, name: true },
  });

  // 2. Gather all chart hashes in this pack grouped by difficulty slot
  //    Path: Pack → Simfile → SimfileChart (holds difficulty + chartHash)
  const simfileCharts = await prisma.simfileChart.findMany({
    where: {
      simfile: { packId },
      difficulty: { in: [...PACK_LEADERBOARD_DIFFICULTIES] },
    },
    select: {
      chartHash: true,
      difficulty: true,
    },
  });

  // Group chart hashes by difficulty
  const hashesByDifficulty: Record<string, string[]> = {};
  for (const d of PACK_LEADERBOARD_DIFFICULTIES) {
    hashesByDifficulty[d] = [];
  }
  for (const sc of simfileCharts) {
    if (sc.difficulty && sc.difficulty in hashesByDifficulty) {
      // Avoid duplicates (a chart hash can appear in multiple simfiles within the pack)
      if (!hashesByDifficulty[sc.difficulty].includes(sc.chartHash)) {
        hashesByDifficulty[sc.difficulty].push(sc.chartHash);
      }
    }
  }

  // 3. Collect all unique chart hashes across all difficulties for one DB round-trip
  const allHashes = [...new Set(Object.values(hashesByDifficulty).flat())];
  const allLeaderboardIds = Object.values(SCORING_SYSTEMS) as number[];

  // 4. Fetch best scores
  const bestScores = await getBestScoresForCharts(prisma, allHashes, allLeaderboardIds);

  // 5. Build the users dictionary and the leaderboard results
  const users: Record<string, { alias: string; profileImageUrl: string | null }> = {};
  const leaderboards: Record<string, Record<string, PackScoringLeaderboard>> = {};

  // Index best scores by chartHash+leaderboardId for fast lookup
  const scoreIndex = new Map<string, BestScoreRow[]>();
  for (const row of bestScores) {
    // Track user info
    if (!users[row.userId]) {
      users[row.userId] = {
        alias: row.userAlias,
        profileImageUrl: assetS3UrlToCloudFrontUrl(row.userProfileImageUrl),
      };
    }
    const key = `${row.chartHash}:${row.leaderboardId}`;
    if (!scoreIndex.has(key)) scoreIndex.set(key, []);
    scoreIndex.get(key)!.push(row);
  }

  for (const difficulty of PACK_LEADERBOARD_DIFFICULTIES) {
    const diffHashes = hashesByDifficulty[difficulty];
    leaderboards[difficulty] = {};

    for (const [systemKey, leaderboardId] of Object.entries(SCORING_SYSTEMS)) {
      // Accumulate per-user totals for this difficulty + scoring system
      const userTotals = new Map<string, { totalScore: number; chartsPlayed: number }>();

      for (const chartHash of diffHashes) {
        const key = `${chartHash}:${leaderboardId}`;
        const rows = scoreIndex.get(key) ?? [];
        for (const row of rows) {
          const curvedPoints = scoreToCurvedPoints(row.score);
          const existing = userTotals.get(row.userId);
          if (existing) {
            existing.totalScore += curvedPoints;
            existing.chartsPlayed += 1;
          } else {
            userTotals.set(row.userId, { totalScore: curvedPoints, chartsPlayed: 1 });
          }
        }
      }

      // Sort descending by totalScore
      const sorted = Array.from(userTotals.entries())
        .map(([userId, data]) => ({ userId, ...data }))
        .sort((a, b) => b.totalScore - a.totalScore);

      const rankings: PackLeaderboardRanking[] = sorted.map((entry, idx) => ({
        rank: idx + 1,
        userId: entry.userId,
        totalScore: entry.totalScore,
        chartsPlayed: entry.chartsPlayed,
      }));

      leaderboards[difficulty][systemKey] = {
        totalParticipants: rankings.length,
        rankings,
      };
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    packId: pack.id,
    packName: pack.name,
    users,
    leaderboards,
  };
}
