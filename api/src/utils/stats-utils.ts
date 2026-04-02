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
