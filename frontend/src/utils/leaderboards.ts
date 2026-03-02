import { LeaderboardId, backendNameFor, inferIdFromBackendName, isValidLeaderboardId } from '../types/leaderboards';

interface ScoreLike {
  leaderboards: { leaderboard: string; data?: any }[];
}

export function isScoreInLeaderboard(score: ScoreLike, id: LeaderboardId): boolean {
  const names = backendNameFor(id);
  return score.leaderboards.some((lb) => {
    const norm = inferIdFromBackendName(lb.leaderboard) ?? lb.leaderboard;
    return names.includes(lb.leaderboard) || inferIdFromBackendName(lb.leaderboard) === id || norm === id;
  });
}

export function findLeaderboardData<T = any>(entries: { leaderboard: string; data: T }[], id: LeaderboardId): T | undefined {
  for (const entry of entries) {
    if (inferIdFromBackendName(entry.leaderboard) === id) return entry.data;
    if (backendNameFor(id).includes(entry.leaderboard)) return entry.data;
  }
  return undefined;
}

export function coerceLeaderboardId(value: any, fallback: LeaderboardId = 'HardEX'): LeaderboardId {
  if (isValidLeaderboardId(value)) return value;
  const inferred = typeof value === 'string' ? inferIdFromBackendName(value) : undefined;
  return inferred ?? fallback;
}
