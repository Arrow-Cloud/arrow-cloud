import { GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID, GLOBAL_HARD_EX_LEADERBOARD_ID } from './leaderboard';

// Leaderboard IDs for perfect score detection
export const ITG_LEADERBOARD_ID = GLOBAL_MONEY_LEADERBOARD_ID;
export const EX_LEADERBOARD_ID = GLOBAL_EX_LEADERBOARD_ID;
export const HARD_EX_LEADERBOARD_ID = GLOBAL_HARD_EX_LEADERBOARD_ID;

// Maximum block rating (meter) to count for quads/quints/hexes
export const MAX_METER_FOR_PERFECT_SCORES = 50;

// Minimum steps hit to count for quads/quints/hexes
export const MIN_STEPS_FOR_PERFECT_SCORES = 100;

// Pack IDs excluded from quad/quint/hex calculations
export const EXCLUDED_PACK_IDS = [228]; // OTOGO FUSION

/**
 * Extract steps hit (non-Miss judgments) from PlayLeaderboard data
 */
export function extractStepsHit(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const judgments = (data as { judgments?: Record<string, number> }).judgments;
  if (!judgments || typeof judgments !== 'object') return 0;

  let stepsHit = 0;
  for (const [judgment, count] of Object.entries(judgments)) {
    if (judgment !== 'Miss' && typeof count === 'number') {
      stepsHit += count;
    }
  }
  return stepsHit;
}

/**
 * Check if a leaderboard score is 100%
 */
export function isPerfectScore(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const score = (data as { score?: string }).score;
  return score === '100.00';
}

export interface PerfectScoreCounts {
  quads: number;
  quints: number;
  hexes: number;
}

interface PlayForPerfectScoreCheck {
  chartHash: string;
  chart: {
    meter: number | null;
    simfiles: Array<{ simfile: { packId: number } }>;
  } | null;
  PlayLeaderboard: Array<{ leaderboardId: number; data: unknown }>;
}

/**
 * Check if a single play is eligible for quad/quint/hex counting.
 * Requirements: chart belongs to a non-excluded pack, meter <= 50, and at least `stepsHit` steps hit.
 */
export function isPlayEligibleForPerfectScores(chartPackIds: number[], meter: number | null | undefined, stepsHit: number): boolean {
  const chartInPack = chartPackIds.length > 0;
  const chartInExcludedPack = chartPackIds.some((id) => EXCLUDED_PACK_IDS.includes(id));
  const meterOk = meter != null && meter <= MAX_METER_FOR_PERFECT_SCORES;
  const enoughSteps = stepsHit >= MIN_STEPS_FOR_PERFECT_SCORES;
  return chartInPack && !chartInExcludedPack && meterOk && enoughSteps;
}

/**
 * Count quads/quints/hexes across an array of plays that include PlayLeaderboard entries.
 */
export function countPerfectScores(plays: PlayForPerfectScoreCheck[]): PerfectScoreCounts {
  const quadCharts = new Set<string>();
  const quintCharts = new Set<string>();
  const hexCharts = new Set<string>();
  for (const play of plays) {
    const itgData = play.PlayLeaderboard.find((pl) => pl.leaderboardId === ITG_LEADERBOARD_ID)?.data;
    const stepsHit = extractStepsHit(itgData);
    const chartPackIds = play.chart?.simfiles?.map((sc) => sc.simfile.packId) ?? [];
    if (isPlayEligibleForPerfectScores(chartPackIds, play.chart?.meter, stepsHit)) {
      if (isPerfectScore(itgData)) quadCharts.add(play.chartHash);
      const exData = play.PlayLeaderboard.find((pl) => pl.leaderboardId === EX_LEADERBOARD_ID)?.data;
      if (isPerfectScore(exData)) quintCharts.add(play.chartHash);
      const hexData = play.PlayLeaderboard.find((pl) => pl.leaderboardId === HARD_EX_LEADERBOARD_ID)?.data;
      if (isPerfectScore(hexData)) hexCharts.add(play.chartHash);
    }
  }
  return { quads: quadCharts.size, quints: quintCharts.size, hexes: hexCharts.size };
}
