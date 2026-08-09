/* eslint-disable formatjs/no-literal-string-in-jsx */
import React, { useState, useEffect } from 'react';
import type { WidgetSession } from '../../../schemas/apiSchemas';
import { PANEL_WIDTH, PANEL_HEIGHT, COMPACT_HEIGHTS, HORIZONTAL_WIDTHS } from '../../../utils/widgetConfig';
import { GradeImage } from '../../../components/GradeImage';

const HEADER_H = 28;
const FADE_IN: React.CSSProperties = { animation: 'widgetFadeIn 0.4s ease' };
const DURATION_FONT: React.CSSProperties = { fontFamily: "'Nunito', sans-serif", fontWeight: 800 };

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatSteps(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

interface Props {
  session: WidgetSession | null | undefined;
  orientation: 'horizontal' | 'vertical';
}

export const SessionPanel: React.FC<Props> = ({ session, orientation }) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!session?.isOngoing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session?.isOngoing]);

  const isLive = session?.isOngoing ?? false;
  const quads = session?.quads ?? 0;
  const quints = session?.quints ?? 0;
  const hexes = session?.hexes ?? 0;
  const hasPerfects = quads > 0 || quints > 0 || hexes > 0;

  const durationMs = session
    ? session.isOngoing
      ? now - new Date(session.startedAt).getTime()
      : new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()
    : 0;

  const timerClass = isLive ? 'text-success' : 'text-primary/70';

  const header = (
    <div
      style={{ height: HEADER_H }}
      className="relative flex items-center justify-between px-3 flex-shrink-0 bg-base-300/80 z-10 border-b border-base-content/10"
    >
      <span className="text-[11px] font-semibold text-base-content/75 tracking-wide">Session</span>
      {isLive ? (
        <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full text-success bg-success/15">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          LIVE
        </span>
      ) : session ? (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-primary/60 bg-primary/10">ended</span>
      ) : null}
    </div>
  );

  if (orientation === 'vertical') {
    return (
      <div
        style={{ width: PANEL_WIDTH, height: COMPACT_HEIGHTS.currentSession }}
        className="relative flex flex-col overflow-hidden border-b border-base-content/10 bg-base-200"
      >
        <div className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-transparent via-primary/50 to-transparent z-10" />
        {header}
        {session ? (
          <div key={String(isLive)} className="flex-1 flex items-center gap-0 px-3" style={FADE_IN}>
            <div className="flex flex-col items-center px-2">
              <span className={`text-sm leading-none tabular-nums ${timerClass}`} style={DURATION_FONT}>
                {formatDuration(durationMs)}
              </span>
              <span className="text-[8px] text-base-content/50 uppercase tracking-wide mt-0.5">Time</span>
            </div>
            <div className="w-px h-6 bg-base-content/10 mx-1 flex-shrink-0" />
            <div className="flex items-center justify-around flex-1">
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold text-primary leading-none">{session.playCount}</span>
                <span className="text-[8px] text-base-content/50 uppercase tracking-wide mt-0.5">Plays</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold text-primary leading-none">{session.distinctCharts}</span>
                <span className="text-[8px] text-base-content/50 uppercase tracking-wide mt-0.5">Charts</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold text-primary leading-none">{formatSteps(session.stepsHit)}</span>
                <span className="text-[8px] text-base-content/50 uppercase tracking-wide mt-0.5">Steps</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-base-content/40">No active session</div>
        )}
      </div>
    );
  }

  // Horizontal
  const W = HORIZONTAL_WIDTHS.currentSession;
  const bodyH = PANEL_HEIGHT - HEADER_H;

  return (
    <div style={{ width: W, height: PANEL_HEIGHT }} className="relative flex flex-col overflow-hidden bg-base-200">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/10 pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent z-10" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-base-content/10 to-transparent z-10" />
      {header}

      {session ? (
        <div key={String(isLive)} style={{ height: bodyH, ...FADE_IN }} className="flex flex-col items-center justify-center gap-4 px-3">
          {/* Timer */}
          <div className="flex flex-col items-center gap-1">
            <span className={`leading-none tabular-nums ${timerClass}`} style={{ fontSize: '2rem', ...DURATION_FONT }}>
              {formatDuration(durationMs)}
            </span>
            <span className="text-[9px] font-semibold text-base-content/50 uppercase tracking-widest">Duration</span>
          </div>

          {/* Main stats */}
          <div className="flex items-center justify-around w-full">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-lg font-bold text-primary leading-none">{session.playCount}</span>
              <span className="text-[9px] text-base-content/50 uppercase tracking-wide">Plays</span>
            </div>
            <div className="w-px h-7 bg-base-content/10" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-lg font-bold text-primary leading-none">{session.distinctCharts}</span>
              <span className="text-[9px] text-base-content/50 uppercase tracking-wide">Charts</span>
            </div>
            <div className="w-px h-7 bg-base-content/10" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-lg font-bold text-primary leading-none">{formatSteps(session.stepsHit)}</span>
              <span className="text-[9px] text-base-content/50 uppercase tracking-wide">Steps</span>
            </div>
          </div>

          {/* Perfect score counts — only rendered when non-zero */}
          {hasPerfects && (
            <div className="flex items-center gap-3">
              {quads > 0 && (
                <span className="flex items-center gap-1">
                  <GradeImage grade="quad" className="w-5 h-5" />
                  <span className="text-sm font-bold text-base-content">{quads}</span>
                </span>
              )}
              {quints > 0 && (
                <span className="flex items-center gap-1">
                  <GradeImage grade="quint" className="w-5 h-5" />
                  <span className="text-sm font-bold text-base-content">{quints}</span>
                </span>
              )}
              {hexes > 0 && (
                <span className="flex items-center gap-1">
                  <GradeImage grade="hex" className="w-5 h-5" />
                  <span className="text-sm font-bold text-base-content">{hexes}</span>
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ height: bodyH }} className="flex items-center justify-center text-sm text-base-content/40">
          No active session
        </div>
      )}
    </div>
  );
};
