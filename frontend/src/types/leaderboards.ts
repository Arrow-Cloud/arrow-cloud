// Canonical leaderboard types and label/mapping utilities
export type LeaderboardId = 'HardEX' | 'EX' | 'ITG';

export const ALL_LEADERBOARD_IDS: LeaderboardId[] = ['HardEX', 'EX', 'ITG'];

export const LEADERBOARD_LABELS: Record<LeaderboardId, string> = {
  HardEX: 'H.EX',
  EX: 'EX',
  ITG: 'ITG',
};

// Backend names observed in API payloads; adjust if they change
// Some pages reference full names like 'Blue Shift HardEX (Beta)' — centralize here.
interface BackendNameMapEntry {
  patterns: RegExp[];
  canonical: LeaderboardId;
}

const BACKEND_NAME_PATTERNS: BackendNameMapEntry[] = [
  // Support both legacy "HardEX" and new "HardEX" spellings and abbreviations
  { canonical: 'HardEX', patterns: [/hard\s?ex/i, /blue\s*shift\s*hardex/i, /h\.ex/i] },
  { canonical: 'EX', patterns: [/(?:^|\s)ex(?:\s|$|\()/i, /blue\s*shift\s*ex/i] },
  { canonical: 'ITG', patterns: [/itg/i, /money/i, /blue\s*shift\s*money/i] }, // treating Money as ITG for now
];

export function isValidLeaderboardId(value: any): value is LeaderboardId {
  return ALL_LEADERBOARD_IDS.includes(value as LeaderboardId);
}

export function inferIdFromBackendName(name: string): LeaderboardId | undefined {
  const lowered = name.toLowerCase();
  for (const entry of BACKEND_NAME_PATTERNS) {
    if (entry.patterns.some((p) => p.test(lowered))) return entry.canonical;
  }
  return undefined;
}

export function backendNameFor(id: LeaderboardId): string[] {
  switch (id) {
    case 'HardEX':
      // Include Beta and Phase names for robustness - match actual backend names
      return ['HardEX', 'H.EX', 'Blue Shift HardEX (Beta)', 'Blue Shift Phase 1 HardEX', 'Blue Shift Phase 2 HardEX', 'Blue Shift Phase 3 HardEX'];
    case 'EX':
      return ['EX', 'Blue Shift EX (Beta)', 'Blue Shift Phase 1 EX', 'Blue Shift Phase 2 EX', 'Blue Shift Phase 3 EX'];
    case 'ITG':
      return ['ITG', 'Money', 'Blue Shift Money (Beta)', 'Blue Shift Phase 1 Money', 'Blue Shift Phase 2 Money', 'Blue Shift Phase 3 Money'];
  }
}
