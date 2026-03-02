/**
 * Assign Blue Shift Trophies (Dry Run)
 *
 * This script calculates which users should receive each Blue Shift trophy
 * based on their participation and performance during the event.
 *
 * Usage:
 *   npx tsx scripts/assign-blueshift-trophies.ts [--commit]
 *
 * Without --commit, this runs in dry-run mode and only reports what would happen.
 */

import { PrismaClient } from '../api/prisma/generated/client';
import {
  PHASE_1_HASHES,
  PHASE_2_HASHES,
  PHASE_3_HASHES,
  BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID,
} from '../api/src/utils/events/blueshift';
import axios from 'axios';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Simple pluralization helper
 */
function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || singular + 's');
}

/**
 * Interpolate template strings in trophy descriptions
 * Supports {variableName} syntax
 */
function interpolateDescription(template: string, metadata: Record<string, unknown> | null): string {
  if (!metadata) return template;
  
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = metadata[key];
    return value !== undefined ? String(value) : match;
  });
}

// ============================================================================
// Types
// ============================================================================

interface TrophyDefinition {
  name: string;
  description: string; // Static description for display when no interpolation needed
  descriptionTemplate: string; // Template with {variable} placeholders for database storage
  tier: 'common' | 'rare' | 'epic' | 'legendary';
  evaluate: (ctx: EvaluationContext) => TrophyAssignment[];
}

interface TrophyAssignment {
  userId: string;
  userAlias: string;
  metadata?: Record<string, any>;
}

interface TrophyReport {
  trophyName: string;
  tier: string;
  description: string;
  descriptionTemplate: string;
  assignments: TrophyAssignment[];
}

interface UserPlayData {
  userId: string;
  userAlias: string;
  chartHash: string;
  songName: string;
  playCount: number;
  bestScores: {
    leaderboardId: number;
    leaderboardType: string;
    score: number;
    grade: string;
    passed: boolean;
  }[];
}

interface PhaseLeaderboardEntry {
  userId: string;
  userAlias: string;
  rank: number;
  totalPoints: number;
  leaderboardType: string;
}

interface ChartLeaderboardEntry {
  userId: string;
  userAlias: string;
  chartHash: string;
  rank: number;
  score: number;
  grade: string;
  leaderboardType: string;
  phase: number;
}

interface OverallLeaderboardEntry {
  userId: string;
  userAlias: string;
  rank: number;
  totalWeightedPoints: number;
  leaderboardType: string;
}

interface UserPassedChartData {
  userId: string;
  userAlias: string;
  chartHash: string;
}

// Same structure for charts with any play (passed or failed)
type UserPlayedChartData = UserPassedChartData;

interface EvaluationContext {
  // All user play data (one entry per user per chart)
  userPlayData: UserPlayData[];
  // Phase leaderboard rankings
  phaseLeaderboards: {
    phase1: PhaseLeaderboardEntry[];
    phase2: PhaseLeaderboardEntry[];
    phase3: PhaseLeaderboardEntry[];
  };
  // Per-chart leaderboards for podium detection
  chartLeaderboards: ChartLeaderboardEntry[];
  // Overall leaderboard rankings
  overallLeaderboards: OverallLeaderboardEntry[];
  // All chart hashes
  allChartHashes: string[];
  // Charts that each user has passed (grade != 'F')
  userPassedCharts: UserPassedChartData[];
  // Charts that each user has played (any grade)
  userPlayedCharts: UserPlayedChartData[];
}

// ============================================================================
// Constants
// ============================================================================

const ALL_CHART_HASHES = [...PHASE_1_HASHES, ...PHASE_2_HASHES, ...PHASE_3_HASHES];
const TOTAL_CHARTS = ALL_CHART_HASHES.length; // Should be 65

const ALL_LEADERBOARD_IDS = [
  BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID,
];

const EX_LEADERBOARD_IDS = [
  BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID,
];

const MONEY_LEADERBOARD_IDS = [
  BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID,
];

const HARD_EX_LEADERBOARD_IDS = [
  BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID,
];

// Grade thresholds
const QUAD_THRESHOLD = 100.0; // 4-star / quad
const QUINT_THRESHOLD = 100.0; // 5-star / quint
const HEX_THRESHOLD = 100.0; // 6-star / hex

// ============================================================================
// Trophy Definitions
// ============================================================================

const TROPHY_DEFINITIONS: TrophyDefinition[] = [
  // --- Participation Trophies ---
  {
    name: 'Blue Shift Participant',
    description: 'Submitted at least one score in Blue Shift',
    descriptionTemplate: 'Submitted at least one score in Blue Shift',
    tier: 'common',
    evaluate: (ctx) => {
      const participants = new Map<string, string>();
      for (const data of ctx.userPlayData) {
        if (!participants.has(data.userId)) {
          participants.set(data.userId, data.userAlias);
        }
      }
      return Array.from(participants.entries()).map(([userId, userAlias]) => ({
        userId,
        userAlias,
      }));
    },
  },

  // --- Completionist Trophies ---
  {
    name: 'Blue Shift Completionist I',
    description: 'Submitted a score for all 65 charts in Blue Shift',
    descriptionTemplate: 'Submitted a score for all 65 charts in Blue Shift',
    tier: 'common',
    evaluate: (ctx) => {
      // Use userPlayedCharts which is fetched by looking at ALL plays
      // regardless of pass/fail status
      const userChartsMap = new Map<string, Set<string>>();
      const userAliases = new Map<string, string>();

      for (const data of ctx.userPlayedCharts) {
        if (!userChartsMap.has(data.userId)) {
          userChartsMap.set(data.userId, new Set());
        }
        userChartsMap.get(data.userId)!.add(data.chartHash);
        userAliases.set(data.userId, data.userAlias);
      }

      return Array.from(userChartsMap.entries())
        .filter(([_, charts]) => charts.size >= TOTAL_CHARTS)
        .map(([userId]) => ({
          userId,
          userAlias: userAliases.get(userId)!,
        }));
    },
  },

  {
    name: 'Blue Shift Completionist II',
    description: 'Passed all 65 charts in Blue Shift',
    descriptionTemplate: 'Passed all 65 charts in Blue Shift',
    tier: 'rare',
    evaluate: (ctx) => {
      // Use userPassedCharts which is fetched by looking at ALL scores
      // and finding charts where any score has grade != 'F'
      const userPassedChartsMap = new Map<string, Set<string>>();
      const userAliases = new Map<string, string>();

      for (const data of ctx.userPassedCharts) {
        if (!userPassedChartsMap.has(data.userId)) {
          userPassedChartsMap.set(data.userId, new Set());
        }
        userPassedChartsMap.get(data.userId)!.add(data.chartHash);
        userAliases.set(data.userId, data.userAlias);
      }

      return Array.from(userPassedChartsMap.entries())
        .filter(([_, charts]) => charts.size >= TOTAL_CHARTS)
        .map(([userId]) => ({
          userId,
          userAlias: userAliases.get(userId)!,
        }));
    },
  },

  {
    name: 'Blue Shift Completionist III',
    description: 'Got 85% EX or better on all 65 charts in Blue Shift',
    descriptionTemplate: 'Got 85% EX or better on all 65 charts in Blue Shift',
    tier: 'epic',
    evaluate: (ctx) => {
      const userQualifyingCharts = new Map<string, Set<string>>();
      const userAliases = new Map<string, string>();

      for (const data of ctx.userPlayData) {
        // Find the best EX score (filter by EX leaderboard IDs)
        const exScore = data.bestScores.find((s) => EX_LEADERBOARD_IDS.includes(s.leaderboardId));
        if (exScore && Number(exScore.score) >= 85.0) {
          if (!userQualifyingCharts.has(data.userId)) {
            userQualifyingCharts.set(data.userId, new Set());
          }
          userQualifyingCharts.get(data.userId)!.add(data.chartHash);
        }
        userAliases.set(data.userId, data.userAlias);
      }

      return Array.from(userQualifyingCharts.entries())
        .filter(([_, charts]) => charts.size >= TOTAL_CHARTS)
        .map(([userId]) => ({
          userId,
          userAlias: userAliases.get(userId)!,
        }));
    },
  },

  {
    name: 'Blue Shift Completionist IV',
    description: 'Got 96% Money or better on all 65 charts in Blue Shift',
    descriptionTemplate: 'Got 96% Money or better on all 65 charts in Blue Shift',
    tier: 'legendary',
    evaluate: (ctx) => {
      const userQualifyingCharts = new Map<string, Set<string>>();
      const userAliases = new Map<string, string>();

      for (const data of ctx.userPlayData) {
        // Find the best Money score (filter by Money leaderboard IDs)
        const moneyScore = data.bestScores.find((s) => MONEY_LEADERBOARD_IDS.includes(s.leaderboardId));
        if (moneyScore && Number(moneyScore.score) >= 96.0) {
          if (!userQualifyingCharts.has(data.userId)) {
            userQualifyingCharts.set(data.userId, new Set());
          }
          userQualifyingCharts.get(data.userId)!.add(data.chartHash);
        }
        userAliases.set(data.userId, data.userAlias);
      }

      return Array.from(userQualifyingCharts.entries())
        .filter(([_, charts]) => charts.size >= TOTAL_CHARTS)
        .map(([userId]) => ({
          userId,
          userAlias: userAliases.get(userId)!,
        }));
    },
  },

  // --- Phase Ranking Trophies (mutually exclusive - user gets highest tier only) ---
  {
    name: 'Blue Shift Phase Top 50',
    description: 'Finished top 50 in any phase',
    descriptionTemplate: 'Finished top 50 in at least one phase leaderboard in Blue Shift',
    tier: 'rare',
    evaluate: (ctx) => {
      return evaluatePhaseRankingTrophy(ctx, 6, 50);
    },
  },

  {
    name: 'Blue Shift Phase Top 25',
    description: 'Finished top 25 in any phase',
    descriptionTemplate: 'Finished top 25 in at least one phase leaderboard in Blue Shift',
    tier: 'epic',
    evaluate: (ctx) => {
      return evaluatePhaseRankingTrophy(ctx, 6, 25);
    },
  },

  {
    name: 'Blue Shift Phase Top 5',
    description: 'Finished top 5 in any phase',
    descriptionTemplate: 'Finished top 5 in at least one phase leaderboard in Blue Shift',
    tier: 'legendary',
    evaluate: (ctx) => {
      return evaluatePhaseRankingTrophy(ctx, 1, 5);
    },
  },

  // --- Overall Ranking Trophies (mutually exclusive - user gets highest tier only) ---
  {
    name: 'Blue Shift Overall Top 50',
    description: 'Finished top 50 in the overall rankings',
    descriptionTemplate: 'Finished {placement} in Blue Shift',
    tier: 'rare',
    evaluate: (ctx) => {
      return evaluateOverallRankingTrophy(ctx, 6, 50);
    },
  },

  {
    name: 'Blue Shift Overall Top 25',
    description: 'Finished top 25 in the overall rankings',
    descriptionTemplate: 'Finished {placement} in Blue Shift',
    tier: 'epic',
    evaluate: (ctx) => {
      return evaluateOverallRankingTrophy(ctx, 6, 25);
    },
  },

  {
    name: 'Blue Shift Overall Top 5',
    description: 'Finished top 5 in the overall rankings',
    descriptionTemplate: 'Finished {placement} in Blue Shift',
    tier: 'legendary',
    evaluate: (ctx) => {
      return evaluateOverallRankingTrophy(ctx, 1, 5);
    },
  },

  // --- Podium Trophy ---
  {
    name: 'Blue Shift Single Song Podium',
    description: 'Finished top 3 on a song in any phase',
    descriptionTemplate: 'Achieved {n_finishes} in Blue Shift',
    tier: 'legendary',
    evaluate: (ctx) => {
      const podiumUsers = new Map<string, { userAlias: string; count: number }>();

      for (const entry of ctx.chartLeaderboards) {
        if (entry.rank <= 3) {
          if (!podiumUsers.has(entry.userId)) {
            podiumUsers.set(entry.userId, { userAlias: entry.userAlias, count: 0 });
          }
          podiumUsers.get(entry.userId)!.count++;
        }
      }

      return Array.from(podiumUsers.entries()).map(([userId, data]) => ({
        userId,
        userAlias: data.userAlias,
        metadata: { n_finishes: `${data.count} podium ${pluralize(data.count, 'finish', 'finishes')}` },
      }));
    },
  },

  // --- Quadder Trophies (Money leaderboard, score >= 100.0) ---
  {
    name: 'Blue Shift Quadder I',
    description: 'Quadded at least one chart in Blue Shift',
    descriptionTemplate: 'Quadded {n_charts} in Blue Shift',
    tier: 'rare',
    evaluate: (ctx) => {
      return evaluatePerfectScoreTrophy(ctx, MONEY_LEADERBOARD_IDS, QUAD_THRESHOLD, 1);
    },
  },

  {
    name: 'Blue Shift Quadder II',
    description: 'Quadded 10 or more charts in Blue Shift',
    descriptionTemplate: 'Quadded {n_charts} in Blue Shift',
    tier: 'epic',
    evaluate: (ctx) => {
      return evaluatePerfectScoreTrophy(ctx, MONEY_LEADERBOARD_IDS, QUAD_THRESHOLD, 10);
    },
  },

  {
    name: 'Blue Shift Quadder III',
    description: 'Quadded 25 or more charts in Blue Shift',
    descriptionTemplate: 'Quadded {n_charts} in Blue Shift',
    tier: 'legendary',
    evaluate: (ctx) => {
      return evaluatePerfectScoreTrophy(ctx, MONEY_LEADERBOARD_IDS, QUAD_THRESHOLD, 25);
    },
  },

  // --- Quinter Trophies (EX leaderboard, score >= 100.0) ---
  {
    name: 'Blue Shift Quinter I',
    description: 'Quinted at least one chart in Blue Shift',
    descriptionTemplate: 'Quinted {n_charts} in Blue Shift',
    tier: 'epic',
    evaluate: (ctx) => {
      return evaluatePerfectScoreTrophy(ctx, EX_LEADERBOARD_IDS, QUINT_THRESHOLD, 1);
    },
  },

  {
    name: 'Blue Shift Quinter II',
    description: 'Quinted 10 or more charts in Blue Shift',
    descriptionTemplate: 'Quinted {n_charts} in Blue Shift',
    tier: 'legendary',
    evaluate: (ctx) => {
      return evaluatePerfectScoreTrophy(ctx, EX_LEADERBOARD_IDS, QUINT_THRESHOLD, 10);
    },
  },

  // --- Hexer Trophy (Hard EX leaderboard, score >= 100.0) ---
  {
    name: 'Blue Shift Hexer',
    description: 'Hex-starred at least one chart in Blue Shift',
    descriptionTemplate: 'Hex-starred {n_charts} in Blue Shift',
    tier: 'legendary',
    evaluate: (ctx) => {
      return evaluatePerfectScoreTrophy(ctx, HARD_EX_LEADERBOARD_IDS, HEX_THRESHOLD, 1);
    },
  },

  // --- Grinder Trophy ---
  {
    name: 'Blue Shift Grinder',
    description: 'Played a single chart 20 or more times in Blue Shift',
    descriptionTemplate: 'Played {song} {n_times} in Blue Shift',
    tier: 'rare',
    evaluate: (ctx) => {
      const grinders = new Map<string, { userAlias: string; maxPlays: number; chartHash: string; songName: string }>();

      for (const data of ctx.userPlayData) {
        if (data.playCount >= 20) {
          const existing = grinders.get(data.userId);
          if (!existing || data.playCount > existing.maxPlays) {
            grinders.set(data.userId, {
              userAlias: data.userAlias,
              maxPlays: data.playCount,
              chartHash: data.chartHash,
              songName: data.songName || data.chartHash,
            });
          }
        }
      }

      return Array.from(grinders.entries()).map(([userId, data]) => ({
        userId,
        userAlias: data.userAlias,
        metadata: { song: data.songName, n_times: `${data.maxPlays} ${pluralize(data.maxPlays, 'time')}` },
      }));
    },
  },
];

// ============================================================================
// Helper Functions for Trophy Evaluation
// ============================================================================

function evaluatePhaseRankingTrophy(ctx: EvaluationContext, minRank: number, maxRank: number): TrophyAssignment[] {
  const qualifyingUsers = new Map<string, { userAlias: string; bestRank: number }>();

  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  for (const [phaseName, entries] of Object.entries(ctx.phaseLeaderboards)) {
    for (const entry of entries) {
      if (entry.rank >= minRank && entry.rank <= maxRank) {
        const existing = qualifyingUsers.get(entry.userId);
        if (!existing || entry.rank < existing.bestRank) {
          qualifyingUsers.set(entry.userId, {
            userAlias: entry.userAlias,
            bestRank: entry.rank,
          });
        }
      }
    }
  }

  return Array.from(qualifyingUsers.entries()).map(([userId, data]) => ({
    userId,
    userAlias: data.userAlias,
    // No metadata needed - template is static
  }));
}

function evaluateOverallRankingTrophy(ctx: EvaluationContext, minRank: number, maxRank: number): TrophyAssignment[] {
  const qualifyingUsers = new Map<string, { userAlias: string; placements: { rank: number; type: string }[] }>();

  for (const entry of ctx.overallLeaderboards) {
    if (entry.rank >= minRank && entry.rank <= maxRank) {
      if (!qualifyingUsers.has(entry.userId)) {
        qualifyingUsers.set(entry.userId, { userAlias: entry.userAlias, placements: [] });
      }
      qualifyingUsers.get(entry.userId)!.placements.push({ rank: entry.rank, type: entry.leaderboardType });
    }
  }

  return Array.from(qualifyingUsers.entries()).map(([userId, data]) => ({
    userId,
    userAlias: data.userAlias,
    // Sort by rank (best first), then join: "#1 Money, #3 HardEX"
    metadata: {
      placement: data.placements
        .sort((a, b) => a.rank - b.rank)
        .map((p) => `#${p.rank} ${p.type}`)
        .join(', '),
    },
  }));
}

function evaluatePerfectScoreTrophy(
  ctx: EvaluationContext,
  leaderboardIds: number[],
  scoreThreshold: number,
  requiredCount: number,
): TrophyAssignment[] {
  // Use a Set to ensure each chart only counts once per user
  const qualifyingUsers = new Map<string, { userAlias: string; charts: Set<string> }>();

  for (const data of ctx.userPlayData) {
    const score = data.bestScores.find((s) => leaderboardIds.includes(s.leaderboardId));
    if (score && Number(score.score) >= scoreThreshold) {
      if (!qualifyingUsers.has(data.userId)) {
        qualifyingUsers.set(data.userId, { userAlias: data.userAlias, charts: new Set() });
      }
      qualifyingUsers.get(data.userId)!.charts.add(data.chartHash);
    }
  }

  return Array.from(qualifyingUsers.entries())
    .filter(([_, data]) => data.charts.size >= requiredCount)
    .map(([userId, data]) => ({
      userId,
      userAlias: data.userAlias,
      metadata: { n_charts: `${data.charts.size} ${pluralize(data.charts.size, 'chart')}` },
    }));
}

// ============================================================================
// Data Fetching
// ============================================================================

async function fetchUserPlayData(prisma: PrismaClient): Promise<UserPlayData[]> {
  console.log('Fetching user play data...');

  const rawResults = await prisma.$queryRaw<any[]>`
    WITH play_counts AS (
      SELECT
        p."userId",
        u.alias as "userAlias",
        p."chartHash",
        COUNT(*) as "playCount"
      FROM "Play" p
      JOIN "User" u ON p."userId" = u.id
      WHERE p."chartHash" = ANY(${ALL_CHART_HASHES})
      GROUP BY p."userId", u.alias, p."chartHash"
    ),
    best_scores AS (
      SELECT DISTINCT ON (p."userId", p."chartHash", l.id)
        p."userId",
        p."chartHash",
        l.id as "leaderboardId",
        l.type as "leaderboardType",
        (pl.data->>'score')::decimal as score,
        pl.data->>'grade' as grade,
        COALESCE((pl.data->>'passed')::boolean, true) as passed
      FROM "PlayLeaderboard" pl
      JOIN "Play" p ON pl."playId" = p.id
      JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
      WHERE p."chartHash" = ANY(${ALL_CHART_HASHES})
        AND l.id = ANY(${ALL_LEADERBOARD_IDS})
      ORDER BY p."userId", p."chartHash", l.id, (pl.data->>'score')::decimal DESC
    )
    SELECT
      pc."userId",
      pc."userAlias",
      pc."chartHash",
      c."songName",
      pc."playCount"::int,
      COALESCE(
        json_agg(
          json_build_object(
            'leaderboardId', bs."leaderboardId",
            'leaderboardType', bs."leaderboardType",
            'score', bs.score,
            'grade', bs.grade,
            'passed', bs.passed
          )
        ) FILTER (WHERE bs."leaderboardId" IS NOT NULL),
        '[]'::json
      ) as "bestScores"
    FROM play_counts pc
    JOIN "Chart" c ON pc."chartHash" = c.hash
    LEFT JOIN best_scores bs ON pc."userId" = bs."userId" AND pc."chartHash" = bs."chartHash"
    GROUP BY pc."userId", pc."userAlias", pc."chartHash", c."songName", pc."playCount"
  `;

  console.log(`Found ${rawResults.length} user-chart combinations`);
  return rawResults.map((r) => ({
    userId: r.userId,
    userAlias: r.userAlias,
    chartHash: r.chartHash,
    songName: r.songName,
    playCount: r.playCount,
    bestScores: r.bestScores,
  }));
}

/**
 * Fetch all user-chart combinations where the user has passed the chart.
 * A chart is considered "passed" if the user has ANY score with grade != 'F'.
 * This looks at ALL scores, not just the best score per leaderboard.
 */
async function fetchUserPassedCharts(prisma: PrismaClient): Promise<UserPassedChartData[]> {
  console.log('Fetching user passed charts (any non-F grade)...');

  const rawResults = await prisma.$queryRaw<UserPassedChartData[]>`
    SELECT DISTINCT
      p."userId",
      u.alias as "userAlias",
      p."chartHash"
    FROM "PlayLeaderboard" pl
    JOIN "Play" p ON pl."playId" = p.id
    JOIN "User" u ON p."userId" = u.id
    JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
    WHERE p."chartHash" = ANY(${ALL_CHART_HASHES})
      AND l.id = ANY(${ALL_LEADERBOARD_IDS})
      AND pl.data->>'grade' != 'F'
  `;

  console.log(`Found ${rawResults.length} user-chart passed combinations`);
  return rawResults;
}

/**
 * Fetch all user-chart combinations where the user has ANY play.
 * This includes both passed and failed attempts.
 */
async function fetchUserPlayedCharts(prisma: PrismaClient): Promise<UserPlayedChartData[]> {
  console.log('Fetching user played charts (any grade)...');

  const rawResults = await prisma.$queryRaw<UserPlayedChartData[]>`
    SELECT DISTINCT
      p."userId",
      u.alias as "userAlias",
      p."chartHash"
    FROM "PlayLeaderboard" pl
    JOIN "Play" p ON pl."playId" = p.id
    JOIN "User" u ON p."userId" = u.id
    JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
    WHERE p."chartHash" = ANY(${ALL_CHART_HASHES})
      AND l.id = ANY(${ALL_LEADERBOARD_IDS})
  `;

  console.log(`Found ${rawResults.length} user-chart played combinations`);
  return rawResults;
}

async function fetchPhaseLeaderboards(): Promise<EvaluationContext['phaseLeaderboards']> {
  console.log('Fetching phase leaderboards from CDN...');

  // Fetch the overall summary JSON from CDN
  const cdnUrl = 'https://assets.arrowcloud.dance/json/blueshift-overall-summary.json';
  const response = await axios.get(cdnUrl);
  const summary = response.data;

  const result: EvaluationContext['phaseLeaderboards'] = {
    phase1: [],
    phase2: [],
    phase3: [],
  };

  // Extract users lookup
  const users = summary.users as Record<string, { alias: string }>;

  // Process each phase
  for (const [phaseName, phaseKey] of [['phase1', 'phase1'], ['phase2', 'phase2'], ['phase3', 'phase3']] as const) {
    const phaseData = summary.phases[phaseKey];
    if (!phaseData?.leaderboards) continue;

    for (const [leaderboardType, lbData] of Object.entries(phaseData.leaderboards)) {
      const rankings = (lbData as any).rankings || [];
      let rank = 1;
      for (const entry of rankings) {
        result[phaseName].push({
          userId: entry.userId,
          userAlias: users[entry.userId]?.alias || 'Unknown',
          rank: rank++,
          totalPoints: entry.totalPoints,
          leaderboardType,
        });
      }
    }
  }

  console.log(`Phase 1: ${result.phase1.length} entries, Phase 2: ${result.phase2.length} entries, Phase 3: ${result.phase3.length} entries`);
  return result;
}

async function fetchChartLeaderboards(prisma: PrismaClient): Promise<ChartLeaderboardEntry[]> {
  console.log('Fetching chart leaderboards...');

  const results: ChartLeaderboardEntry[] = [];

  // Query per-chart rankings for podium detection
  const rawResults = await prisma.$queryRaw<any[]>`
    WITH ranked_scores AS (
      SELECT
        p."userId",
        u.alias as "userAlias",
        p."chartHash",
        l.type as "leaderboardType",
        (pl.data->>'score')::decimal as score,
        pl.data->>'grade' as grade,
        RANK() OVER (
          PARTITION BY p."chartHash", l.type
          ORDER BY (pl.data->>'score')::decimal DESC
        ) as rank
      FROM (
        SELECT DISTINCT ON (p."userId", p."chartHash", l.id)
          p.id, p."userId", p."chartHash", pl."leaderboardId", pl.data
        FROM "Play" p
        JOIN "PlayLeaderboard" pl ON pl."playId" = p.id
        JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
        WHERE p."chartHash" = ANY(${ALL_CHART_HASHES})
          AND l.id = ANY(${ALL_LEADERBOARD_IDS})
        ORDER BY p."userId", p."chartHash", l.id, (pl.data->>'score')::decimal DESC
      ) sub
      JOIN "Play" p ON sub.id = p.id
      JOIN "User" u ON p."userId" = u.id
      JOIN "PlayLeaderboard" pl ON pl."playId" = p.id AND pl."leaderboardId" = sub."leaderboardId"
      JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
    )
    SELECT * FROM ranked_scores WHERE rank <= 3
  `;

  // Determine phase for each chart
  for (const r of rawResults) {
    let phase = 1;
    if (PHASE_2_HASHES.includes(r.chartHash)) phase = 2;
    else if (PHASE_3_HASHES.includes(r.chartHash)) phase = 3;

    results.push({
      userId: r.userId,
      userAlias: r.userAlias,
      chartHash: r.chartHash,
      rank: Number(r.rank),
      score: Number(r.score),
      grade: r.grade,
      leaderboardType: r.leaderboardType,
      phase,
    });
  }

  console.log(`Found ${results.length} podium entries`);
  return results;
}

async function fetchOverallLeaderboards(): Promise<OverallLeaderboardEntry[]> {
  console.log('Fetching overall leaderboards from CDN...');

  const cdnUrl = 'https://assets.arrowcloud.dance/json/blueshift-overall-summary.json';
  const response = await axios.get(cdnUrl);
  const summary = response.data;

  const results: OverallLeaderboardEntry[] = [];
  const users = summary.users as Record<string, { alias: string }>;

  for (const [leaderboardType, lbData] of Object.entries(summary.overall)) {
    const rankings = (lbData as any).rankings || [];
    let rank = 1;
    for (const entry of rankings) {
      results.push({
        userId: entry.userId,
        userAlias: users[entry.userId]?.alias || 'Unknown',
        rank: rank++,
        totalWeightedPoints: entry.totalWeightedPoints,
        leaderboardType,
      });
    }
  }

  console.log(`Found ${results.length} overall leaderboard entries`);
  return results;
}

// ============================================================================
// Trophy Assignment (Database Writes)
// ============================================================================

async function assignTrophiesToUser(
  prisma: PrismaClient,
  userId: string,
  reports: TrophyReport[],
  mutuallyExclusiveTrophies: Map<string, Set<string>>,
): Promise<{ assigned: number; skipped: number }> {
  let assigned = 0;
  let skipped = 0;

  // Get all trophy records from DB
  const trophies = await prisma.trophy.findMany();
  const trophyByName = new Map(trophies.map((t) => [t.name, t]));

  for (const report of reports) {
    const trophy = trophyByName.get(report.trophyName);
    if (!trophy) {
      console.log(`  ⚠️  Trophy "${report.trophyName}" not found in database, skipping`);
      skipped++;
      continue;
    }

    // Find assignment for this user
    const assignment = report.assignments.find((a) => a.userId === userId);
    if (!assignment) {
      continue; // User not eligible for this trophy
    }

    // Check mutual exclusivity - skip if user should get a higher tier instead
    const exclusionSet = mutuallyExclusiveTrophies.get(report.trophyName);
    if (exclusionSet && exclusionSet.has(userId)) {
      console.log(`  ⏭️  Skipping "${report.trophyName}" - user gets higher tier`);
      skipped++;
      continue;
    }

    // Upsert the UserTrophy record
    await prisma.userTrophy.upsert({
      where: {
        userId_trophyId: { userId, trophyId: trophy.id },
      },
      create: {
        userId,
        trophyId: trophy.id,
        metadata: assignment.metadata ?? undefined,
      },
      update: {
        metadata: assignment.metadata ?? undefined,
        updatedAt: new Date(),
      },
    });

    console.log(`  ✅ Assigned "${report.trophyName}" to user`);
    assigned++;
  }

  return { assigned, skipped };
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const isDryRun = !process.argv.includes('--commit');
  
  // Parse --user=<userId> argument
  const userArg = process.argv.find((arg) => arg.startsWith('--user='));
  const targetUserId = userArg ? userArg.split('=')[1] : null;

  console.log('='.repeat(80));
  console.log('BLUE SHIFT TROPHY ASSIGNMENT');
  console.log(isDryRun ? '*** DRY RUN MODE - No changes will be made ***' : '*** COMMIT MODE - Trophies will be assigned ***');
  if (targetUserId) {
    console.log(`*** TARGET USER: ${targetUserId} ***`);
  }
  console.log('='.repeat(80));
  console.log(`\nTotal Blue Shift charts: ${TOTAL_CHARTS}`);

  const prisma = new PrismaClient();

  try {
    // Gather all evaluation context data
    const [userPlayData, phaseLeaderboards, chartLeaderboards, overallLeaderboards, userPassedCharts, userPlayedCharts] = await Promise.all([
      fetchUserPlayData(prisma),
      fetchPhaseLeaderboards(),
      fetchChartLeaderboards(prisma),
      fetchOverallLeaderboards(),
      fetchUserPassedCharts(prisma),
      fetchUserPlayedCharts(prisma),
    ]);

    const ctx: EvaluationContext = {
      userPlayData,
      phaseLeaderboards,
      chartLeaderboards,
      overallLeaderboards,
      allChartHashes: ALL_CHART_HASHES,
      userPassedCharts,
      userPlayedCharts,
    };

    // Evaluate all trophies
    console.log('\n' + '='.repeat(80));
    console.log('TROPHY EVALUATION RESULTS');
    console.log('='.repeat(80));

    const reports: TrophyReport[] = [];

    for (const trophy of TROPHY_DEFINITIONS) {
      const assignments = trophy.evaluate(ctx);
      reports.push({
        trophyName: trophy.name,
        tier: trophy.tier,
        description: trophy.description,
        descriptionTemplate: trophy.descriptionTemplate,
        assignments,
      });
    }

    // Print summary
    console.log('\n' + '-'.repeat(80));
    console.log('SUMMARY');
    console.log('-'.repeat(80));
    console.log(
      String('Trophy Name').padEnd(35) +
      String('Tier').padEnd(12) +
      String('Users').padEnd(8),
    );
    console.log('-'.repeat(80));

    let totalAssignments = 0;
    for (const report of reports) {
      console.log(
        report.trophyName.padEnd(35) +
        report.tier.padEnd(12) +
        String(report.assignments.length).padEnd(8),
      );
      totalAssignments += report.assignments.length;
    }

    console.log('-'.repeat(80));
    console.log(`Total trophy assignments: ${totalAssignments}`);
    console.log(`Unique users with trophies: ${new Set(reports.flatMap((r) => r.assignments.map((a) => a.userId))).size}`);

    // Print detailed breakdown for each trophy
    console.log('\n' + '='.repeat(80));
    console.log('DETAILED BREAKDOWN');
    console.log('='.repeat(80));

    for (const report of reports) {
      console.log(`\n${report.trophyName} (${report.tier.toUpperCase()}) - ${report.assignments.length} users`);
      console.log(`  Description: "${report.description}"`);
      console.log(`  Template:    "${report.descriptionTemplate}"`);
      for (const assignment of report.assignments) {
        const interpolated = interpolateDescription(report.descriptionTemplate, assignment.metadata || null);
        console.log(`    - ${assignment.userAlias}: "${interpolated}"`);
      }
    }

    // Handle mutual exclusivity for phase ranking trophies
    console.log('\n' + '='.repeat(80));
    console.log('MUTUAL EXCLUSIVITY ANALYSIS');
    console.log('='.repeat(80));

    const phaseTop5Users = new Set(reports.find((r) => r.trophyName === 'Blue Shift Phase Top 5')?.assignments.map((a) => a.userId) || []);
    const phaseTop25Users = new Set(reports.find((r) => r.trophyName === 'Blue Shift Phase Top 25')?.assignments.map((a) => a.userId) || []);
    const phaseTop50Users = new Set(reports.find((r) => r.trophyName === 'Blue Shift Phase Top 50')?.assignments.map((a) => a.userId) || []);

    const phaseTop25Only = [...phaseTop25Users].filter((u) => !phaseTop5Users.has(u));
    const phaseTop50Only = [...phaseTop50Users].filter((u) => !phaseTop25Users.has(u));

    console.log('\nPhase Ranking Trophies (each user gets only highest tier):');
    console.log(`  Phase Top 5: ${phaseTop5Users.size} users`);
    console.log(`  Phase Top 25 (excluding Top 5): ${phaseTop25Only.length} users`);
    console.log(`  Phase Top 50 (excluding Top 25): ${phaseTop50Only.length} users`);

    const overallTop5Users = new Set(reports.find((r) => r.trophyName === 'Blue Shift Overall Top 5')?.assignments.map((a) => a.userId) || []);
    const overallTop25Users = new Set(reports.find((r) => r.trophyName === 'Blue Shift Overall Top 25')?.assignments.map((a) => a.userId) || []);
    const overallTop50Users = new Set(reports.find((r) => r.trophyName === 'Blue Shift Overall Top 50')?.assignments.map((a) => a.userId) || []);

    const overallTop25Only = [...overallTop25Users].filter((u) => !overallTop5Users.has(u));
    const overallTop50Only = [...overallTop50Users].filter((u) => !overallTop25Users.has(u));

    console.log('\nOverall Ranking Trophies (each user gets only highest tier):');
    console.log(`  Overall Top 5: ${overallTop5Users.size} users`);
    console.log(`  Overall Top 25 (excluding Top 5): ${overallTop25Only.length} users`);
    console.log(`  Overall Top 50 (excluding Top 25): ${overallTop50Only.length} users`);

    // Completionist series
    const completionistIVUsersSet = new Set(reports.find((r) => r.trophyName === 'Blue Shift Completionist IV')?.assignments.map((a) => a.userId) || []);
    const completionistIIIUsersSet = new Set(reports.find((r) => r.trophyName === 'Blue Shift Completionist III')?.assignments.map((a) => a.userId) || []);
    const completionistIIUsersSet = new Set(reports.find((r) => r.trophyName === 'Blue Shift Completionist II')?.assignments.map((a) => a.userId) || []);
    const completionistIUsersSet = new Set(reports.find((r) => r.trophyName === 'Blue Shift Completionist')?.assignments.map((a) => a.userId) || []);

    console.log('\nCompletionist Trophies (each user gets only highest tier):');
    console.log(`  Completionist IV: ${completionistIVUsersSet.size} users`);
    console.log(`  Completionist III (excluding IV): ${[...completionistIIIUsersSet].filter((u) => !completionistIVUsersSet.has(u)).length} users`);
    console.log(`  Completionist II (excluding III): ${[...completionistIIUsersSet].filter((u) => !completionistIIIUsersSet.has(u)).length} users`);
    console.log(`  Completionist I (excluding II): ${[...completionistIUsersSet].filter((u) => !completionistIIUsersSet.has(u)).length} users`);

    // Quadder series
    const quadderIIIUsersSet = new Set(reports.find((r) => r.trophyName === 'Blue Shift Quadder III')?.assignments.map((a) => a.userId) || []);
    const quadderIIUsersSet = new Set(reports.find((r) => r.trophyName === 'Blue Shift Quadder II')?.assignments.map((a) => a.userId) || []);
    const quadderIUsersSet = new Set(reports.find((r) => r.trophyName === 'Blue Shift Quadder I')?.assignments.map((a) => a.userId) || []);

    console.log('\nQuadder Trophies (each user gets only highest tier):');
    console.log(`  Quadder III: ${quadderIIIUsersSet.size} users`);
    console.log(`  Quadder II (excluding III): ${[...quadderIIUsersSet].filter((u) => !quadderIIIUsersSet.has(u)).length} users`);
    console.log(`  Quadder I (excluding II): ${[...quadderIUsersSet].filter((u) => !quadderIIUsersSet.has(u)).length} users`);

    // Quinter series
    const quinterIIUsersSet = new Set(reports.find((r) => r.trophyName === 'Blue Shift Quinter II')?.assignments.map((a) => a.userId) || []);
    const quinterIUsersSet = new Set(reports.find((r) => r.trophyName === 'Blue Shift Quinter I')?.assignments.map((a) => a.userId) || []);

    console.log('\nQuinter Trophies (each user gets only highest tier):');
    console.log(`  Quinter II: ${quinterIIUsersSet.size} users`);
    console.log(`  Quinter I (excluding II): ${[...quinterIUsersSet].filter((u) => !quinterIIUsersSet.has(u)).length} users`);

    // Build mutual exclusivity map
    const mutuallyExclusiveTrophies = new Map<string, Set<string>>();
    
    // Phase ranking: lower tiers excluded if user has higher tier
    mutuallyExclusiveTrophies.set('Blue Shift Phase Top 50', phaseTop25Users);
    mutuallyExclusiveTrophies.set('Blue Shift Phase Top 25', phaseTop5Users);
    
    // Overall ranking: lower tiers excluded if user has higher tier
    mutuallyExclusiveTrophies.set('Blue Shift Overall Top 50', overallTop25Users);
    mutuallyExclusiveTrophies.set('Blue Shift Overall Top 25', overallTop5Users);

    // Completionist series: lower tiers excluded if user has higher tier
    const completionistIVUsers = new Set(reports.find((r) => r.trophyName === 'Blue Shift Completionist IV')?.assignments.map((a) => a.userId) || []);
    const completionistIIIUsers = new Set(reports.find((r) => r.trophyName === 'Blue Shift Completionist III')?.assignments.map((a) => a.userId) || []);
    const completionistIIUsers = new Set(reports.find((r) => r.trophyName === 'Blue Shift Completionist II')?.assignments.map((a) => a.userId) || []);
    
    mutuallyExclusiveTrophies.set('Blue Shift Completionist I', new Set([...completionistIIUsers]));
    mutuallyExclusiveTrophies.set('Blue Shift Completionist II', new Set([...completionistIIIUsers]));
    mutuallyExclusiveTrophies.set('Blue Shift Completionist III', new Set([...completionistIVUsers]));

    // Quadder series: lower tiers excluded if user has higher tier
    const quadderIIIUsers = new Set(reports.find((r) => r.trophyName === 'Blue Shift Quadder III')?.assignments.map((a) => a.userId) || []);
    const quadderIIUsers = new Set(reports.find((r) => r.trophyName === 'Blue Shift Quadder II')?.assignments.map((a) => a.userId) || []);
    
    mutuallyExclusiveTrophies.set('Blue Shift Quadder I', new Set([...quadderIIUsers]));
    mutuallyExclusiveTrophies.set('Blue Shift Quadder II', new Set([...quadderIIIUsers]));

    // Quinter series: lower tiers excluded if user has higher tier
    const quinterIIUsers = new Set(reports.find((r) => r.trophyName === 'Blue Shift Quinter II')?.assignments.map((a) => a.userId) || []);
    
    mutuallyExclusiveTrophies.set('Blue Shift Quinter I', new Set([...quinterIIUsers]));

    if (!isDryRun) {
      // Collect all unique users who earned at least one trophy
      const allUserIds = new Set<string>();
      const userAliasMap = new Map<string, string>();
      for (const report of reports) {
        for (const assignment of report.assignments) {
          allUserIds.add(assignment.userId);
          userAliasMap.set(assignment.userId, assignment.userAlias);
        }
      }

      // If --user is specified, only process that user
      const usersToProcess = targetUserId ? [targetUserId] : [...allUserIds];

      if (targetUserId) {
        // Verify user exists
        const user = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!user) {
          console.log(`\n❌ User "${targetUserId}" not found in database`);
          process.exit(1);
        }
        console.log('\n' + '='.repeat(80));
        console.log(`ASSIGNING TROPHIES TO: ${user.alias} (${user.id})`);
        console.log('='.repeat(80));
      } else {
        console.log('\n' + '='.repeat(80));
        console.log(`ASSIGNING TROPHIES TO ALL ${usersToProcess.length} USERS`);
        console.log('='.repeat(80));
      }

      let totalAssigned = 0;
      let totalSkipped = 0;

      for (const userId of usersToProcess) {
        const alias = userAliasMap.get(userId) || userId;
        console.log(`\n👤 ${alias} (${userId})`);

        const { assigned, skipped } = await assignTrophiesToUser(prisma, userId, reports, mutuallyExclusiveTrophies);
        totalAssigned += assigned;
        totalSkipped += skipped;
      }

      console.log('\n' + '='.repeat(80));
      console.log('FINAL SUMMARY');
      console.log('='.repeat(80));
      console.log(`Users processed: ${usersToProcess.length}`);
      console.log(`✅ Total assigned: ${totalAssigned} trophies`);
      console.log(`⏭️  Total skipped: ${totalSkipped} trophies`);
    }

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
