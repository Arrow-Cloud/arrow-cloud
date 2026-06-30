/* eslint-disable formatjs/no-literal-string-in-jsx */
import React from 'react';
import { BannerImage } from '../../../components/ui/BannerImage';
import type { WidgetPackLeaderboard } from '../../../schemas/apiSchemas';
import { PANEL_WIDTH, PANEL_HEIGHT, COMPACT_HEIGHTS, type LeaderboardKey } from '../../../utils/widgetConfig';
import { useRotatingIndex } from './useRotatingIndex';

const LB_LABELS: Record<LeaderboardKey, string> = { HardEX: 'H.EX', EX: 'EX', ITG: 'ITG' };
const LB_COLORS: Record<LeaderboardKey, string> = { HardEX: '#FF69B4', EX: '#21CCE8', ITG: '#ffffff' };
const FADE_IN: React.CSSProperties = { animation: 'widgetFadeIn 0.4s ease' };

interface Props {
  packName: string;
  bannerUrl: string | null;
  data: WidgetPackLeaderboard;
  leaderboards: LeaderboardKey[];
  orientation: 'horizontal' | 'vertical';
}

export const PackLeaderboardPanel: React.FC<Props> = ({ packName, bannerUrl, data, leaderboards, orientation }) => {
  const idx = useRotatingIndex(leaderboards.length);
  const activeLb = leaderboards[idx];
  const entry = data.leaderboards[activeLb];
  const lbColor = LB_COLORS[activeLb];

  if (orientation === 'vertical') {
    return (
      <div
        style={{ width: PANEL_WIDTH, height: COMPACT_HEIGHTS.packLeaderboard }}
        className="relative flex items-center gap-2 px-2 overflow-hidden bg-gradient-to-r from-base-200 via-base-300 to-base-200 border-b border-base-300/30"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        <div className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-transparent via-primary/50 to-transparent" />

        {/* Small banner — static */}
        {bannerUrl && (
          <div className="flex-shrink-0 rounded overflow-hidden" style={{ width: 51, height: 20 }}>
            <BannerImage bannerUrl={bannerUrl} alt={packName} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex-1 min-w-0 z-10">
          {/* Pack name + badge row */}
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[11px] font-bold text-base-content/70 truncate">{packName}</span>
            {/* Badge — fades with leaderboard color */}
            <span key={activeLb} className="text-[9px] font-bold px-1 py-0.5 rounded bg-black/50 flex-shrink-0" style={{ color: lbColor, ...FADE_IN }}>
              {LB_LABELS[activeLb]}
            </span>
          </div>
          {/* Rank + score — fades */}
          {entry ? (
            <div key={activeLb} className="flex items-baseline gap-2" style={FADE_IN}>
              <span className="text-xl font-black leading-none" style={{ color: lbColor }}>
                #{entry.rank}
              </span>
              <span className="text-[10px] text-base-content/40">of {entry.totalParticipants}</span>
              <span className="text-sm font-bold ml-auto" style={{ color: lbColor }}>
                {entry.totalScore.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                <span className="text-[10px] font-normal text-base-content/40 ml-0.5">pts</span>
              </span>
            </div>
          ) : (
            <span key={activeLb} className="text-[11px] text-base-content/30" style={FADE_IN}>
              No scores yet
            </span>
          )}
        </div>
      </div>
    );
  }

  // Horizontal: banner at top, rank + score below
  const BANNER_H = 100;
  const bodyH = PANEL_HEIGHT - BANNER_H;

  return (
    <div
      style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT }}
      className="relative flex flex-col overflow-hidden bg-gradient-to-br from-base-200 via-base-300 to-base-200"
    >
      <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent z-10" />
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5 pointer-events-none" />

      {/* Banner — static */}
      <div style={{ height: BANNER_H }} className="flex-shrink-0 relative overflow-hidden">
        {bannerUrl ? (
          <BannerImage bannerUrl={bannerUrl} alt={packName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-base-300 flex items-center justify-center">
            <span className="text-xs text-base-content/30 truncate px-2">{packName}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-base-200/80" />
        {/* Badge — fades with leaderboard color */}
        <div className="absolute bottom-1 right-2">
          <span key={activeLb} className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-black/60" style={{ color: lbColor, ...FADE_IN }}>
            {LB_LABELS[activeLb]}
          </span>
        </div>
      </div>

      {/* Rank + score — fades with leaderboard color */}
      <div style={{ height: bodyH }} className="flex flex-col items-center justify-center z-10 gap-1">
        <span className="text-xs font-semibold text-base-content/50 truncate px-2 max-w-full">{packName}</span>
        {entry ? (
          <div key={activeLb} className="flex flex-col items-center gap-1" style={FADE_IN}>
            <div className="text-4xl font-black drop-shadow-lg leading-none" style={{ color: lbColor }}>
              #{entry.rank}
            </div>
            <div className="text-xs text-base-content/40">of {entry.totalParticipants}</div>
            <div className="mt-2 bg-black/30 rounded-lg px-3 py-1 backdrop-blur-sm">
              <span className="text-xl font-bold" style={{ color: lbColor }}>
                {entry.totalScore.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                <span className="text-xs font-normal text-base-content/40 ml-1">pts</span>
              </span>
            </div>
          </div>
        ) : (
          <div key={activeLb} className="text-sm text-base-content/40" style={FADE_IN}>
            No scores yet
          </div>
        )}
      </div>
    </div>
  );
};
