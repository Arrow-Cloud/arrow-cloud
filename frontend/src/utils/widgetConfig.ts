export type LeaderboardKey = 'HardEX' | 'EX' | 'ITG';
export type PackLeaderboardDifficulty = 'medium' | 'hard' | 'challenge';

export type WidgetFeatureConfig =
  | { type: 'profile' }
  | { type: 'recentPlays'; leaderboards: LeaderboardKey[] }
  | {
      type: 'packLeaderboard';
      packId: number;
      packName: string;
      bannerUrl: string | null;
      difficulty: PackLeaderboardDifficulty;
      leaderboards: LeaderboardKey[];
    };

export interface WidgetConfig {
  version: 1;
  orientation: 'horizontal' | 'vertical';
  features: WidgetFeatureConfig[];
}

export const PANEL_WIDTH = 300;
export const PANEL_HEIGHT = 240;

// Compact heights used in vertical orientation — each feature type gets a strip
// Compact heights for vertical orientation strips
export const COMPACT_HEIGHTS: Record<WidgetFeatureConfig['type'], number> = {
  profile: 60,
  recentPlays: 144,
  packLeaderboard: 80,
};

// Panel widths for horizontal orientation (profile is narrower — it's just avatar + name)
export const HORIZONTAL_WIDTHS: Record<WidgetFeatureConfig['type'], number> = {
  profile: 140,
  recentPlays: 300,
  packLeaderboard: 235,
};

export const ELIGIBLE_PACK_IDS = [101, 102, 131, 346, 348];

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
  if (config.orientation === 'horizontal') {
    const width = config.features.reduce((sum, f) => sum + HORIZONTAL_WIDTHS[f.type], 0) || PANEL_WIDTH;
    return { width, height: PANEL_HEIGHT };
  }
  // Vertical: sum compact heights per feature type
  const height = config.features.reduce((sum, f) => sum + COMPACT_HEIGHTS[f.type], 0) || PANEL_HEIGHT;
  return { width: PANEL_WIDTH, height };
}
