/* eslint-disable formatjs/no-literal-string-in-jsx */
import React from 'react';
import { BannerImage } from '../../../components/ui/BannerImage';
import { GradeImage } from '../../../components/GradeImage';
import type { WidgetRecentPlay } from '../../../schemas/apiSchemas';
import { PANEL_WIDTH, PANEL_HEIGHT, COMPACT_HEIGHTS, HORIZONTAL_WIDTHS, type LeaderboardKey } from '../../../utils/widgetConfig';
import { useRotatingIndex } from './useRotatingIndex';

const LB_LABELS: Record<LeaderboardKey, string> = { HardEX: 'H.EX', EX: 'EX', ITG: 'ITG' };
const LB_COLORS: Record<LeaderboardKey, string> = { HardEX: '#FF69B4', EX: '#21CCE8', ITG: '#ffffff' };
const LB_KEY_FOR_TYPE: Record<string, LeaderboardKey> = { HardEX: 'HardEX', EX: 'EX', Money: 'ITG', ITG: 'ITG' };

const MAX_PLAYS = 3;
const HEADER_H = 28;
const SCORE_FONT: React.CSSProperties = { fontFamily: "'Nunito', sans-serif", fontWeight: 800 };
const FADE_IN: React.CSSProperties = { animation: 'widgetFadeIn 0.4s ease' };

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
    return {
      i,
      title: play.chart.title ?? 'Unknown',
      score: matchingLb?.data?.score,
      grade: matchingLb?.data?.grade,
      chart: play.chart,
    };
  });

  if (orientation === 'vertical') {
    const ROW_H = Math.floor((COMPACT_HEIGHTS.recentPlays - HEADER_H) / MAX_PLAYS);
    return (
      <div style={{ width: PANEL_WIDTH, height: COMPACT_HEIGHTS.recentPlays }} className="relative flex flex-col overflow-hidden border-b border-base-300/30">
        <div className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-transparent via-accent/50 to-transparent z-10" />

        <div style={{ height: HEADER_H }} className="flex items-center justify-between px-3 flex-shrink-0 border-b border-base-300/20 bg-base-300/60 z-10">
          <span className="text-[10px] font-bold text-base-content/70 uppercase tracking-wider">Recent Plays</span>
          <span key={activeLb} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 mr-5" style={{ color: lbColor, ...FADE_IN }}>
            {LB_LABELS[activeLb]}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-xs text-base-content/30 bg-base-200">No recent plays</div>
        ) : (
          rows.map(({ i, title, score, grade, chart }) => (
            <div key={i} style={{ height: ROW_H }} className="relative flex-shrink-0 overflow-hidden">
              <div className="absolute inset-0">
                <BannerImage
                  bannerUrl={chart.bannerUrl}
                  mdBannerUrl={chart.mdBannerUrl}
                  smBannerUrl={chart.smBannerUrl}
                  bannerVariants={(chart as any).bannerVariants}
                  alt={title}
                  className="w-full h-full object-cover scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-base-300/70 via-base-300/60 to-base-300/80" />
              </div>
              <div className="relative z-10 flex items-center gap-2 h-full px-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white leading-tight truncate drop-shadow">{title}</div>
                </div>
                {/* Grade + score in one pill */}
                <div className="flex items-center gap-1 bg-black/50 rounded px-1 py-0.5 flex-shrink-0">
                  {grade && <GradeImage grade={grade} className="w-4 h-4" />}
                  {score && (
                    <span key={`${i}-${activeLb}`} className="text-xs leading-tight drop-shadow" style={{ ...SCORE_FONT, color: lbColor, ...FADE_IN }}>
                      {score}
                    </span>
                  )}
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
  const ROW_H = Math.floor((PANEL_HEIGHT - HEADER_H) / MAX_PLAYS);

  return (
    <div style={{ width: W, height: PANEL_HEIGHT }} className="relative flex flex-col overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent z-10" />
      <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-accent/60 to-transparent z-10" />

      <div style={{ height: HEADER_H }} className="flex items-center justify-between px-3 flex-shrink-0 bg-base-300/80 z-10 border-b border-base-300/40">
        <span className="text-xs font-bold text-base-content/80 uppercase tracking-wide">Recent Plays</span>
        <span key={activeLb} className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-black/50 mr-5" style={{ color: lbColor, ...FADE_IN }}>
          {LB_LABELS[activeLb]}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-sm text-base-content/40 bg-base-200">No recent plays</div>
      ) : (
        rows.map(({ i, title, score, grade, chart }) => (
          <div key={i} style={{ height: ROW_H }} className="relative flex-shrink-0 overflow-hidden">
            <div className="absolute inset-0">
              <BannerImage
                bannerUrl={chart.bannerUrl}
                mdBannerUrl={chart.mdBannerUrl}
                smBannerUrl={chart.smBannerUrl}
                bannerVariants={(chart as any).bannerVariants}
                alt={title}
                className="w-full h-full object-cover scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/65" />
              <div className="absolute bottom-0 left-0 w-full h-px bg-white/5" />
            </div>

            <div className="relative z-10 flex items-center h-full px-3 gap-3">
              {/* Title — takes all available space */}
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-white leading-tight truncate drop-shadow-md">{title}</div>
              </div>

              {/* Grade + score in one pill; grade is static, score fades */}
              <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur-sm rounded-lg px-2 py-1 flex-shrink-0">
                {grade && <GradeImage grade={grade} className="w-7 h-7 drop-shadow" />}
                {score && (
                  <span key={`${i}-${activeLb}`} className="text-base leading-none drop-shadow-md" style={{ ...SCORE_FONT, color: lbColor, ...FADE_IN }}>
                    {score}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
