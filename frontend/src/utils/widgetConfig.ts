export type LeaderboardKey = 'HardEX' | 'EX' | 'ITG' | 'ITGRate' | 'EXRate';
export type PackLeaderboardDifficulty = 'medium' | 'hard' | 'challenge';

export type WidgetFeatureConfig =
  | { type: 'recentPlays'; leaderboards: LeaderboardKey[] }
  | {
      type: 'packLeaderboard';
      packId: number;
      packName: string;
      bannerUrl: string | null;
      difficulty: PackLeaderboardDifficulty;
      leaderboards: LeaderboardKey[];
    }
  | { type: 'currentSession' };

export interface WidgetConfig {
  version: 1;
  orientation: 'horizontal' | 'vertical';
  features: WidgetFeatureConfig[];
}

export const PANEL_WIDTH = 300;
export const PANEL_HEIGHT = 240;

// Height of the always-present profile header band at the top of every widget
export const PROFILE_HEADER_H = 48;

// Compact heights for vertical orientation strips
export const COMPACT_HEIGHTS: Record<WidgetFeatureConfig['type'], number> = {
  recentPlays: 144,
  packLeaderboard: 80,
  currentSession: 80,
};

// Panel widths for horizontal orientation
export const HORIZONTAL_WIDTHS: Record<WidgetFeatureConfig['type'], number> = {
  recentPlays: 300,
  packLeaderboard: 235,
  currentSession: 220,
};

export const ELIGIBLE_PACK_IDS = [101, 102, 131, 346, 348, 371, 380];

export function encodeWidgetConfig(config: WidgetConfig): string {
  return btoa(JSON.stringify(config));
}

export function decodeWidgetConfig(encoded: string): WidgetConfig | null {
  try {
    return JSON.parse(atob(encoded)) as WidgetConfig;
  } catch {
    return null;
  }
}

export function getWidgetDimensions(config: WidgetConfig): { width: number; height: number } {
  // Filter out legacy 'profile' type from old encoded configs
  const features = config.features.filter((f) => (f as any).type !== 'profile');

  if (config.orientation === 'horizontal') {
    const width = features.reduce((sum, f) => sum + (HORIZONTAL_WIDTHS[f.type] ?? 0), 0) || PANEL_WIDTH;
    return { width, height: PANEL_HEIGHT + PROFILE_HEADER_H };
  }
  const height = features.reduce((sum, f) => sum + (COMPACT_HEIGHTS[f.type] ?? 0), 0) || PANEL_HEIGHT;
  return { width: PANEL_WIDTH, height: height + PROFILE_HEADER_H };
}
