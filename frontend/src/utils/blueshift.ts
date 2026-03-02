/**
 * Blue Shift event phase start time: December 5, 2025 at 12:00 PM UTC
 */
export const PHASE_1_START_TIME = new Date('2025-12-05T12:00:00Z');

/**
 * Check if Phase 1 has started based on current UTC time
 */
export const isPhase1Active = (): boolean => {
  const now = new Date();
  return now >= PHASE_1_START_TIME;
};
