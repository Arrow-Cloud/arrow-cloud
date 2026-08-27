// Canonical leaderboard types and label/mapping utilities
export type LeaderboardId = 'HardEX' | 'EX' | 'ITG' | 'ITGRate' | 'EXRate';

export const ALL_LEADERBOARD_IDS: LeaderboardId[] = ['HardEX', 'EX', 'ITG', 'ITGRate', 'EXRate'];

export const LEADERBOARD_LABELS: Record<LeaderboardId, string> = {
  HardEX: 'H.EX',
  EX: 'EX',
  ITG: 'ITG',
  ITGRate: 'ITG (Rate)',
  EXRate: 'EX (Rate)',
};

// Maps a Leaderboard DB row id to its canonical LeaderboardId. Used to translate a user's
// UserPreferredLeaderboard ids (numbers) into the ids this frontend module works with.
export const LEADERBOARD_ID_TO_KEY: Record<number, LeaderboardId> = {
  4: 'HardEX',
  2: 'EX',
  3: 'ITG',
  18: 'ITGRate',
  19: 'EXRate',
};

// Backend names observed in API payloads; adjust if they change
// Some pages reference full names like 'Blue Shift HardEX (Beta)' — centralize here.
interface BackendNameMapEntry {
  patterns: RegExp[];
  canonical: LeaderboardId;
}

// Order matters: inferIdFromBackendName returns the first match, so the rate-eligible
// patterns (which also contain "itg"/"ex" substrings) must be checked before the generic
// ITG/EX patterns, or "ITG (Rate Eligible)" would incorrectly resolve to plain 'ITG'.
const BACKEND_NAME_PATTERNS: BackendNameMapEntry[] = [
  // Support both legacy "HardEX" and new "HardEX" spellings and abbreviations
  { canonical: 'HardEX', patterns: [/hard\s?ex/i, /blue\s*shift\s*hardex/i, /h\.ex/i] },
  { canonical: 'ITGRate', patterns: [/itg.*rate/i] },
  { canonical: 'EXRate', patterns: [/ex.*rate/i] },
  { canonical: 'EX', patterns: [/(?:^|\s)ex(?:\s|$|\()/i, /blue\s*shift\s*ex/i] },
  { canonical: 'ITG', patterns: [/itg/i, /money/i, /blue\s*shift\s*money/i] }, // treating Money as ITG for now
];

export function isValidLeaderboardId(value: any): value is LeaderboardId {
  return ALL_LEADERBOARD_IDS.includes(value as LeaderboardId);
}

// Collapses a rate-eligible id down to its base counterpart. The active leaderboard selection is
// shared globally (see LeaderboardViewContext), but rate-eligible leaderboards are only
// meaningfully supported on pages that have opted in. Surfaces that haven't adopted them yet
// should treat 'ITGRate'/'EXRate' as their base 'ITG'/'EX' so they degrade gracefully instead of
// showing nothing (or crashing) when the shared selection is a rate variant.
export function baseLeaderboardId(id: LeaderboardId): 'HardEX' | 'EX' | 'ITG' {
  if (id === 'ITGRate') return 'ITG';
  if (id === 'EXRate') return 'EX';
  return id;
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
    case 'ITGRate':
      return ['ITG (Rate Eligible)'];
    case 'EXRate':
      return ['EX (Rate Eligible)'];
  }
}
