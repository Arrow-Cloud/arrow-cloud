/* eslint-disable formatjs/no-literal-string-in-jsx */
import React from 'react';
import { BannerImage } from '../../../components/ui/BannerImage';
import { GradeImage } from '../../../components/GradeImage';
import { DifficultyChip } from '../../../components/DifficultyChip';
import type { WidgetRecentPlay } from '../../../schemas/apiSchemas';
import { PANEL_WIDTH, PANEL_HEIGHT, COMPACT_HEIGHTS, HORIZONTAL_WIDTHS, type LeaderboardKey } from '../../../utils/widgetConfig';
import { useRotatingIndex } from './useRotatingIndex';

const LB_LABELS: Record<LeaderboardKey, string> = { HardEX: 'H.EX', EX: 'EX', ITG: 'ITG', ITGRate: 'ITG (Rate)', EXRate: 'EX (Rate)' };
const LB_COLORS: Record<LeaderboardKey, string> = {
  HardEX: '#FF69B4',
  EX: '#21CCE8',
  ITG: '#ffffff',
  ITGRate: '#C9C9FF',
  EXRate: '#7BE0F0',
};
const LB_KEY_FOR_TYPE: Record<string, LeaderboardKey> = {
  HardEX: 'HardEX',
  EX: 'EX',
  Money: 'ITG',
  ITG: 'ITG',
  'ITG (Rate Eligible)': 'ITGRate',
  'EX (Rate Eligible)': 'EXRate',
};

const MAX_PLAYS = 3;
const HEADER_H = 28;
const SCORE_FONT: React.CSSProperties = { fontFamily: "'Nunito', sans-serif", fontWeight: 800 };
const FADE_IN: React.CSSProperties = { animation: 'widgetFadeIn 0.4s ease' };

// Strip 1-2 leading [number] groups from the title, return them as tags
function parseTitleBrackets(raw: string): { tags: string; title: string } {
  const match = raw.match(/^((?:\[\d+\]\s*){1,2})([\s\S]*)/);
  if (match && match[1]) {
    const title = match[2].trim();
    return { tags: match[1].trim(), title: title || raw };
  }
  return { tags: '', title: raw };
}

interface Props {
  plays: WidgetRecentPlay[];
  leaderboards: LeaderboardKey[];
  orientation: 'horizontal' | 'vertical';
}

export const RecentPlaysPanel: React.FC<Props> = ({ plays, leaderboards, orientation }) => {
  const idx = useRotatingIndex(leaderboards.length);
  const activeLb = leaderboards[idx];
  const lbColor = LB_COLORS[activeLb];

  const rows = plays.slice(0, MAX_PLAYS).map((play, i) => {
    const matchingLb = play.leaderboards.find((l) => (LB_KEY_FOR_TYPE[l.leaderboard] ?? l.leaderboard) === activeLb);
    const { tags, title } = parseTitleBrackets(play.chart.title ?? 'Unknown');
    return {
      i,
      tags,
      title,
      artist: play.chart.artist ?? null,
      score: matchingLb?.data?.score,
      grade: matchingLb?.data?.grade,
      chart: play.chart,
    };
  });

  // Shared header — glowing left accent strip changes color with active leaderboard
  const header = (
    <div
      style={{ height: HEADER_H }}
      className="relative flex items-center justify-between px-3 flex-shrink-0 bg-base-300/80 z-10 border-b border-base-content/10"
    >
      {/* Left accent — leaderboard color glow */}
      <div
        className="absolute left-0 inset-y-0 w-[3px]"
        style={{ backgroundColor: lbColor, boxShadow: `0 0 8px 2px ${lbColor}`, transition: 'background-color 0.3s ease, box-shadow 0.3s ease' }}
      />
      <span className="text-[11px] font-semibold text-base-content/75 tracking-wide pl-1">Recent Plays</span>
      <span key={activeLb} className="text-[10px] font-bold px-2 py-0.5 rounded-full mr-5" style={{ color: lbColor, background: `${lbColor}22`, ...FADE_IN }}>
        {LB_LABELS[activeLb]}
      </span>
    </div>
  );

  if (orientation === 'vertical') {
    return (
      <div style={{ width: PANEL_WIDTH, height: COMPACT_HEIGHTS.recentPlays }} className="relative flex flex-col overflow-hidden border-b border-base-300/30">
        <div className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-transparent via-accent/50 to-transparent z-10" />
        {header}
        {rows.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-xs text-white/30 bg-black/40">No recent plays</div>
        ) : (
          rows.map(({ i, tags, title, score, grade, chart }) => (
            <div key={i} className="relative flex-1 overflow-hidden">
              <div className="absolute inset-0">
                <BannerImage
                  bannerUrl={chart.bannerUrl}
                  mdBannerUrl={chart.mdBannerUrl}
                  smBannerUrl={chart.smBannerUrl}
                  bannerVariants={(chart as any).bannerVariants}
                  alt={title}
                  className="w-full h-full object-cover scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/70" />
              </div>
              <div className="relative z-10 flex items-center gap-2 h-full px-2">
                <div className="flex-1 min-w-0">
                  {tags && (
                    <div className="text-[8px] font-semibold leading-none truncate mb-px" style={{ color: lbColor, opacity: 0.7 }}>
                      {tags}
                    </div>
                  )}
                  <div className="text-[11px] font-bold text-white leading-tight truncate">{title}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <DifficultyChip stepsType={chart.stepsType} difficulty={chart.difficulty} meter={chart.meter} size="sm" />
                  <div className="flex items-center gap-1 bg-black/50 rounded px-1 py-0.5">
                    {grade && <GradeImage grade={grade} className="w-4 h-4" />}
                    {score && (
                      <span key={`${i}-${activeLb}`} className="text-xs leading-none" style={{ ...SCORE_FONT, color: lbColor, ...FADE_IN }}>
                        {score}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // Horizontal
  const W = HORIZONTAL_WIDTHS['recentPlays'];

  return (
    <div style={{ width: W, height: PANEL_HEIGHT }} className="relative flex flex-col overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent z-10" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent z-10" />
      {header}
      {rows.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-sm text-white/30 bg-black/40">No recent plays</div>
      ) : (
        rows.map(({ i, tags, title, artist, score, grade, chart }) => (
          <div key={i} className="relative flex-1 overflow-hidden">
            {/* Background: banner + gradient */}
            <div className="absolute inset-0">
              <BannerImage
                bannerUrl={chart.bannerUrl}
                mdBannerUrl={chart.mdBannerUrl}
                smBannerUrl={chart.smBannerUrl}
                bannerVariants={(chart as any).bannerVariants}
                alt={title}
                className="w-full h-full object-cover scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/75" />
              <div className="absolute bottom-0 left-0 w-full h-px bg-white/5" />
            </div>

            <div className="relative z-10 flex items-center h-full px-3 gap-3">
              {/* Metadata: tags → title → artist */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                {tags && (
                  <div className="text-[9px] font-bold leading-none truncate mb-0.5" style={{ color: lbColor, opacity: 0.65 }}>
                    {tags}
                  </div>
                )}
                <div className="text-[13px] font-bold text-white leading-snug truncate">{title}</div>
                {artist && <div className="text-[10px] text-white/45 leading-snug truncate mt-px">{artist}</div>}
              </div>

              {/* Difficulty + score + grade */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <DifficultyChip stepsType={chart.stepsType} difficulty={chart.difficulty} meter={chart.meter} size="sm" />
                <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur-sm rounded-lg px-2 py-1">
                  {grade && <GradeImage grade={grade} className="w-7 h-7 drop-shadow" />}
                  {score && (
                    <span key={`${i}-${activeLb}`} className="text-base leading-none drop-shadow" style={{ ...SCORE_FONT, color: lbColor, ...FADE_IN }}>
                      {score}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
