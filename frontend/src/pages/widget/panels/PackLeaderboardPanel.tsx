/* eslint-disable formatjs/no-literal-string-in-jsx */
import React from 'react';
import { Swords } from 'lucide-react';
import { BannerImage } from '../../../components/ui/BannerImage';
import type { WidgetPackLeaderboard } from '../../../schemas/apiSchemas';
import {
  PANEL_WIDTH,
  PANEL_HEIGHT,
  COMPACT_HEIGHTS,
  HORIZONTAL_WIDTHS,
  type LeaderboardKey,
  type PackLeaderboardDifficulty,
} from '../../../utils/widgetConfig';
import { useRotatingIndex } from './useRotatingIndex';

const LB_LABELS: Record<LeaderboardKey, string> = { HardEX: 'H.EX', EX: 'EX', ITG: 'ITG', ITGRate: 'ITG (Rate)', EXRate: 'EX (Rate)' };
const LB_COLORS: Record<LeaderboardKey, string> = {
  HardEX: '#FF69B4',
  EX: '#21CCE8',
  ITG: '#ffffff',
  ITGRate: '#C9C9FF',
  EXRate: '#7BE0F0',
};
const DIFFICULTY_LABELS: Record<PackLeaderboardDifficulty, string> = { medium: 'Med', hard: 'Hard', challenge: 'Expert' };
const FADE_IN: React.CSSProperties = { animation: 'widgetFadeIn 0.4s ease' };

function fmtScore(n: number): string {
  if (n >= 100000) return `${Math.round(n / 1000)}k`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Deltas abbreviate more aggressively than scores (>1,000 rather than >=10,000) since they're
// shown in a tighter space alongside the rank/name/score.
function fmtDeltaMagnitude(n: number): string {
  if (n > 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Delta is from the streaming user's perspective: positive means this player is ahead of them.
function fmtDelta(delta: number): { text: string; color: string } {
  if (delta > 0) return { text: `+${fmtDeltaMagnitude(delta)}`, color: '#f87272' }; // rival ahead - red
  if (delta < 0) return { text: `-${fmtDeltaMagnitude(Math.abs(delta))}`, color: '#36d399' }; // rival behind - green
  return { text: '±0', color: 'hsl(var(--bc) / 0.5)' };
}

interface Props {
  packName: string;
  bannerUrl: string | null;
  difficulty?: PackLeaderboardDifficulty;
  data: WidgetPackLeaderboard;
  leaderboards: LeaderboardKey[];
  orientation: 'horizontal' | 'vertical';
}

export const PackLeaderboardPanel: React.FC<Props> = ({ packName, bannerUrl, difficulty, data, leaderboards, orientation }) => {
  const idx = useRotatingIndex(leaderboards.length);
  const activeLb = leaderboards[idx];
  const entry = data.leaderboards[activeLb];
  const lbColor = LB_COLORS[activeLb];
  const nearby = entry?.nearby;

  if (orientation === 'vertical') {
    return (
      <div
        style={{ width: PANEL_WIDTH, height: COMPACT_HEIGHTS.packLeaderboard }}
        className="relative flex items-center gap-2 px-2 overflow-hidden bg-gradient-to-r from-base-200 via-base-300 to-base-200 border-b border-base-300/30"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        <div className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-transparent via-primary/50 to-transparent" />

        {bannerUrl && (
          <div className="flex-shrink-0 rounded overflow-hidden" style={{ width: 51, height: 20 }}>
            <BannerImage bannerUrl={bannerUrl} alt={packName} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex-1 min-w-0 z-10">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[11px] font-bold text-base-content/70 truncate">{packName}</span>
            {difficulty && (
              <span className="text-[8px] font-bold px-1 py-0.5 rounded text-base-content/40 bg-base-content/10 flex-shrink-0">
                {DIFFICULTY_LABELS[difficulty]}
              </span>
            )}
            <span key={activeLb} className="text-[9px] font-bold px-1 py-0.5 rounded bg-black/50 flex-shrink-0" style={{ color: lbColor, ...FADE_IN }}>
              {LB_LABELS[activeLb]}
            </span>
          </div>
          {entry ? (
            <div key={activeLb} className="flex items-baseline gap-2" style={FADE_IN}>
              <span className="text-xl font-black leading-none" style={{ color: lbColor }}>
                #{entry.rank}
              </span>
              <span className="text-[10px] text-base-content/40">of {entry.totalParticipants}</span>
              <span className="text-sm font-bold ml-auto" style={{ color: lbColor }}>
                {fmtScore(entry.totalScore)}
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

  // Horizontal: banner on top with overlaid badges (rank bottom-left, pack/difficulty bottom-right),
  // nearby list takes the full body width below.
  const W = HORIZONTAL_WIDTHS['packLeaderboard'];
  const BANNER_H = 90;
  const bodyH = PANEL_HEIGHT - BANNER_H;

  return (
    <div style={{ width: W, height: PANEL_HEIGHT }} className="relative flex flex-col overflow-hidden bg-base-200">
      {/* Banner */}
      <div style={{ height: BANNER_H }} className="flex-shrink-0 relative overflow-hidden">
        {bannerUrl ? (
          <BannerImage bannerUrl={bannerUrl} alt={packName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-base-300 flex items-center justify-center">
            <span className="text-xs text-base-content/30 truncate px-2">{packName}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-base-200/80" />
        {/* Rank badge bottom-left */}
        {entry && (
          <div
            key={activeLb}
            className="absolute bottom-1.5 left-2 flex items-baseline gap-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm"
            style={FADE_IN}
          >
            <span className="text-lg font-black leading-none" style={{ color: lbColor }}>
              #{entry.rank}
            </span>
            <span className="text-[9px] text-white/50 whitespace-nowrap">of {entry.totalParticipants}</span>
          </div>
        )}
        {/* Badges bottom-right */}
        <div className="absolute bottom-1.5 right-2 flex items-center gap-1">
          {difficulty && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-black/60 text-white/60">{DIFFICULTY_LABELS[difficulty]}</span>}
          <span key={activeLb} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60" style={{ color: lbColor, ...FADE_IN }}>
            {LB_LABELS[activeLb]}
          </span>
        </div>
      </div>

      {/* Body: nearby list, full width */}
      <div style={{ height: bodyH }} className="flex flex-row flex-shrink-0">
        {!entry && (
          <div key={activeLb} className="flex-1 flex items-center justify-center text-xs text-base-content/40" style={FADE_IN}>
            No scores yet
          </div>
        )}
        {nearby && nearby.length > 0 && (
          <div key={activeLb} className="flex-1 flex flex-col justify-around px-2.5 py-1.5 min-w-0" style={FADE_IN}>
            {nearby.map((p) => (
              <div key={p.userId} className="flex items-center gap-1.5 min-w-0" style={{ opacity: p.isSelf || p.isRival ? 1 : 0.5 }}>
                <span
                  className="text-xs font-bold w-5 text-right flex-shrink-0 tabular-nums"
                  style={{ color: p.isSelf ? lbColor : p.isRival ? 'hsl(var(--er))' : 'hsl(var(--bc))' }}
                >
                  {p.rank}
                </span>
                <span
                  className="text-sm font-medium flex-1 min-w-0 truncate"
                  style={{ color: p.isSelf ? lbColor : p.isRival ? 'hsl(var(--er))' : 'hsl(var(--bc))' }}
                >
                  {p.alias}
                </span>
                {p.isRival && <Swords className="w-3 h-3 flex-shrink-0 text-error" />}
                <span className="text-[13px] text-base-content/50 flex-shrink-0 tabular-nums">{fmtScore(p.totalScore)}</span>
                {!p.isSelf && typeof p.delta === 'number' && (
                  <span className="text-[12px] font-bold flex-shrink-0 tabular-nums" style={{ color: fmtDelta(p.delta).color }}>
                    {fmtDelta(p.delta).text}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
