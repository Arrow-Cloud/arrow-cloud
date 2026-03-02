import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AppPageLayout, Alert, DifficultyChip, GradeImage, JudgmentList, JUDGMENT_COLORS, getJudgmentColor } from '../../components';
import { BannerImage } from '../../components/ui';
import { LeaderboardToggle } from '../../components/leaderboards/LeaderboardToggle';
import { ShareDialog } from '../../components/plays/ShareDialog';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import { useAuth } from '../../contexts/AuthContext';
import { getPlay, deletePlay } from '../../services/api';
import { type PlayDetails } from '../../schemas/apiSchemas';
import { backendNameFor, type LeaderboardId } from '../../types/leaderboards';
import { Calendar, User, Activity, Loader2, Sigma, BarChart3, Maximize2, Trash2, Share2 } from 'lucide-react';

// Chart.js setup
import { Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip, Legend, Title, Filler, LineController, ScatterController } from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import { FormattedMessage, useIntl } from 'react-intl';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, Title, Filler, LineController, ScatterController);

// Custom tooltip positioner that follows the mouse
Tooltip.positioners.mouse = function (elements, eventPosition) {
  return {
    x: eventPosition.x,
    y: eventPosition.y,
  };
};

function useActiveLeaderboard(play: PlayDetails | null, global: 'HardEX' | 'EX' | 'ITG') {
  return useMemo(() => {
    if (!play) return null;
    // Prefer exact short type first
    let entry = play.leaderboards.find((lb) => lb.leaderboard === global);
    if (entry) return entry;

    // Fallbacks: try known backend display names (legacy + new)
    const names = backendNameFor(global as LeaderboardId);
    for (const n of names) {
      entry = play.leaderboards.find((lb) => lb.leaderboard === n);
      if (entry) return entry;
    }

    // Fallbacks: includes
    const short = global === 'ITG' ? 'Money' : global;
    entry = play.leaderboards.find((lb) => lb.leaderboard.toLowerCase().includes(short.toLowerCase()));
    if (entry) return entry;

    // Last resort: first leaderboard
    return play.leaderboards[0] || null;
  }, [play, global]);
}

const PlayHeader: React.FC<{ play: PlayDetails; onShare: () => void }> = ({ play, onShare }) => {
  const { activeLeaderboard } = useLeaderboardView();
  const { formatMessage, formatNumber } = useIntl();
  const entry = useActiveLeaderboard(play, activeLeaderboard);

  const grade = entry?.data.grade;
  const score = entry?.data.score;

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg relative">
      {/* Share button in top right */}
      <button
        onClick={onShare}
        className="absolute top-4 right-4 z-10 rounded-lg p-[2px] bg-gradient-to-br from-primary via-secondary to-accent shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 group cursor-pointer"
        title={formatMessage({ defaultMessage: 'Share this score', id: '9wJH2E', description: 'Button title to share a score' })}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-base-100/80 backdrop-blur-sm">
          <Share2 size={16} className="group-hover:rotate-12 transition-transform duration-200" />
          <span className="text-sm font-medium">
            <FormattedMessage defaultMessage="Share" id="t29u+f" description="Button text to share a score" />
          </span>
        </div>
      </button>

      <div className="card-body">
        {/* Horizontal layout: Banner on left, metadata on right */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Banner - link to chart page */}
          <Link
            to={`/chart/${play.chart.hash}`}
            className="block hover:opacity-90 transition-opacity lg:w-96 flex-shrink-0"
            aria-label={formatMessage({
              defaultMessage: `Go to chart page`,
              description: 'ARIA label for link to chart page from play page',
              id: '0IbXta',
            })}
          >
            <BannerImage
              bannerVariants={play.chart.bannerVariants}
              mdBannerUrl={play.chart.mdBannerUrl}
              smBannerUrl={play.chart.smBannerUrl}
              bannerUrl={play.chart.bannerUrl}
              alt={formatMessage(
                {
                  defaultMessage: `{title} banner`,
                  description: 'Alt text for chart banner image',
                  id: '82xftT',
                },
                { title: play.chart.title || formatMessage({ defaultMessage: 'Chart', id: 'YoJaPu', description: 'Fallback chart title' }) },
              )}
              className="w-full h-auto rounded-lg shadow-lg"
              sizePreference="responsive"
            />
          </Link>

          {/* Right side: all metadata */}
          <div className="flex-1 flex flex-col justify-between min-w-0">
            {/* Top section: Chart info */}
            <div>
              <h1 className="text-2xl font-bold text-base-content mb-1">
                {play.chart.title || (
                  <FormattedMessage defaultMessage="Unknown Title" id="NZZiZb" description="Displayed when the chart title is not available" />
                )}
              </h1>
              <div className="text-base text-base-content/70 mb-3">
                {play.chart.artist || (
                  <FormattedMessage defaultMessage="Unknown Artist" id="f5pGyU" description="Displayed when the chart artist is not available" />
                )}
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <Link
                  to={`/chart/${play.chart.hash}`}
                  className="inline-block no-underline hover:opacity-90 align-middle"
                  aria-label={formatMessage({ defaultMessage: 'View chart', id: 'gpHicE', description: 'ARIA label for the link to view the chart' })}
                >
                  <DifficultyChip stepsType={play.chart.stepsType} difficulty={play.chart.difficulty} meter={play.chart.meter} size="sm" />
                </Link>
              </div>
            </div>

            {/* Middle section: Score, Grade, Player */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-4">
                <div className="text-3xl font-extrabold tabular-nums">
                  {score
                    ? formatNumber(parseFloat(score) / 100, { style: 'percent', maximumFractionDigits: 2, minimumFractionDigits: 2 })
                    : formatMessage({ defaultMessage: 'n/a', description: 'Not available', id: 'AOeHCB' })}
                </div>
                <GradeImage grade={grade} className="h-10 w-auto object-contain" />
              </div>

              <div className="h-8 w-px bg-base-content/20 hidden sm:block" />

              <Link to={`/user/${play.user.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                {play.user.profileImageUrl ? (
                  <img src={play.user.profileImageUrl} alt={play.user.alias} className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <User size={20} className="text-primary" />
                  </div>
                )}
                <span className="text-lg font-bold text-primary">{play.user.alias}</span>
              </Link>

              <div className="h-8 w-px bg-base-content/20 hidden sm:block" />

              <div className="flex items-center gap-2 text-sm">
                <Calendar size={16} className="text-base-content/60" />
                <span className="font-medium">{new Date(play.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RadarDataSection: React.FC<{ play: PlayDetails }> = ({ play }) => {
  const { activeLeaderboard } = useLeaderboardView();
  const entry = useActiveLeaderboard(play, activeLeaderboard as any);
  const radar = (entry?.data as any)?.radar;

  if (!radar) return null;

  const { holdsHeld, holdsTotal, rollsHit, rollsTotal, minesDodged, minesTotal } = radar;

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body p-4">
        <h3 className="card-title text-lg mb-2">
          <FormattedMessage defaultMessage="Radar Data" id="2Hi91F" description="Title for the radar data section on the play page" />
        </h3>
        <div className="rounded-md border border-base-content/10 overflow-hidden">
          <div className="flex items-center justify-between py-2 px-3 border-b border-base-content/10">
            <span className="text-sm">
              <FormattedMessage defaultMessage="Holds Held" id="OwJKGB" description="Label for holds held in radar data section" />
            </span>
            <span className="text-lg font-bold tabular-nums">
              {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx -- numeric ratio not translatable */}
              {`${holdsHeld}/${holdsTotal}`}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 px-3 border-b border-base-content/10">
            <span className="text-sm">
              <FormattedMessage defaultMessage="Rolls Hit" id="dt96tJ" description="Label for rolls hit in radar data section" />
            </span>
            <span className="text-lg font-bold tabular-nums">
              {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx -- numeric ratio not translatable */}
              {`${rollsHit}/${rollsTotal}`}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 px-3 border-b border-base-content/10 last:border-b-0">
            <span className="text-sm">
              <FormattedMessage defaultMessage="Mines Dodged" id="1VjH1d" description="Label for mines dodged in radar data section" />
            </span>
            <span className="text-lg font-bold tabular-nums">
              {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx -- numeric ratio not translatable */}
              {`${minesDodged}/${minesTotal}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const JudgmentsSection: React.FC<{ play: PlayDetails }> = ({ play }) => {
  const { activeLeaderboard } = useLeaderboardView();
  const entry = useActiveLeaderboard(play, activeLeaderboard as any);
  const j = entry?.data.judgments || {};
  const orderedFromApi = (entry?.data as any)?.judgmentsOrdered as { name: string; value: number }[] | undefined;

  // Use ordered from API if available, otherwise pass raw judgments (JudgmentList will sort)
  const judgments = orderedFromApi || j;

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body p-4">
        <h3 className="card-title text-lg mb-2">
          <FormattedMessage defaultMessage="Judgments" id="xM1sJc" description="Title for the judgments section on the play page" />
        </h3>
        <JudgmentList judgments={judgments} modifiers={play.modifiers} variant="compact" scoringSystem={activeLeaderboard} />
      </div>
    </div>
  );
};

// Scoring helpers mirrored from backend (offsets in seconds)
type TimingWindow = { name: string; maxOffset: number; weight: number };
type ScoringSystem = { name: string; windows: TimingWindow[] };
const HARD_EX_SYS: ScoringSystem = {
  name: 'Hard EX',
  windows: [
    { name: 'Fantastic (10ms)', maxOffset: 0.01, weight: 3.5 },
    { name: 'Fantastic (23ms)', maxOffset: 0.023, weight: 3 },
    { name: 'Excellent', maxOffset: 0.0445, weight: 1 },
    { name: 'Great', maxOffset: 0.1035, weight: 0 },
    { name: 'Decent', maxOffset: 0.1365, weight: 0 },
    { name: 'Way Off', maxOffset: 0.1815, weight: 0 },
  ],
};
const EX_SYS: ScoringSystem = {
  name: 'EX',
  windows: [
    { name: 'Fantastic (15ms)', maxOffset: 0.015, weight: 3.5 },
    { name: 'Fantastic (23ms)', maxOffset: 0.023, weight: 3 },
    { name: 'Excellent', maxOffset: 0.0445, weight: 2 },
    { name: 'Great', maxOffset: 0.1035, weight: 1 },
    { name: 'Decent', maxOffset: 0.1365, weight: 0 },
    { name: 'Way Off', maxOffset: 0.1815, weight: 0 },
  ],
};
const ITG_SYS: ScoringSystem = {
  name: 'ITG',
  windows: [
    { name: 'Fantastic (23ms)', maxOffset: 0.023, weight: 5 },
    { name: 'Excellent', maxOffset: 0.0445, weight: 4 },
    { name: 'Great', maxOffset: 0.1035, weight: 2 },
    { name: 'Decent', maxOffset: 0.1365, weight: 0 },
    { name: 'Way Off', maxOffset: 0.1815, weight: -6 },
  ],
};
// Use shared JUDGMENT_COLORS above

const TimingChartSection: React.FC<{ play: PlayDetails }> = ({ play }) => {
  const { activeLeaderboard } = useLeaderboardView();
  const timing = play.timingData || [];

  // Compute statistics from numeric offsets (exclude Miss entries)
  const stats = useMemo(() => {
    const offsets = timing.filter(([, off]) => typeof off === 'number').map(([, off]) => off as number);
    const n = offsets.length;
    if (n === 0) {
      return { meanMs: null as number | null, meanAbsMs: null as number | null, stdMs: null as number | null, maxErrMs: null as number | null };
    }
    const mean = offsets.reduce((a, b) => a + b, 0) / n;
    const meanAbs = offsets.reduce((a, b) => a + Math.abs(b), 0) / n;
    const variance = offsets.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / n; // population std dev
    const std = Math.sqrt(variance);
    const maxErr = offsets.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    return { meanMs: mean * 1000, meanAbsMs: meanAbs * 1000, stdMs: std * 1000, maxErrMs: maxErr * 1000 };
  }, [timing]);

  const scoring: ScoringSystem = activeLeaderboard === 'HardEX' ? HARD_EX_SYS : activeLeaderboard === 'EX' ? EX_SYS : ITG_SYS;
  const windows = [...scoring.windows].sort((a, b) => a.maxOffset - b.maxOffset);

  // Group by judgment; collect miss times
  const groups: Record<string, { x: number; y: number; judgmentName: string }[]> = {};
  const missTimes: number[] = [];
  for (const [t, off] of timing) {
    if (off === 'Miss') {
      missTimes.push(t);
    } else if (typeof off === 'number') {
      const abs = Math.abs(off);
      const win = windows.find((w) => abs <= w.maxOffset);
      const name = win ? win.name : 'Miss';
      if (!groups[name]) groups[name] = [];
      groups[name].push({ x: t, y: off, judgmentName: name });
    }
  }

  const sorted = Object.keys(groups).sort((a, b) => {
    const wa = windows.find((w) => w.name === a);
    const wb = windows.find((w) => w.name === b);
    if (!wa && !wb) return 0;
    if (!wa) return 1;
    if (!wb) return -1;
    return wa.maxOffset - wb.maxOffset;
  });

  const datasets: any[] = sorted.map((j) => ({
    label: `${j}: ${groups[j].length}`,
    data: groups[j],
    backgroundColor: getJudgmentColor(j, activeLeaderboard),
    borderColor: getJudgmentColor(j, activeLeaderboard),
    hoverBackgroundColor: getJudgmentColor(j, activeLeaderboard),
    hoverBorderColor: getJudgmentColor(j, activeLeaderboard),
    pointRadius: 2,
    pointHoverRadius: 2,
    pointHitRadius: 0,
    showLine: false,
    type: 'scatter' as const,
  }));

  // NPS area (drawn first so appears behind scatter points & lifebar)
  const hasNps = Array.isArray(play.npsData) && play.npsData.length > 0;
  if (hasNps) {
    datasets.unshift({
      label: 'NPS',
      data: (play.npsData || []).map((p: any) => ({ x: p.x, y: p.y })),
      type: 'line' as const,
      fill: 'start',
      tension: 0.15,
      pointRadius: 0,
      pointHoverRadius: 0,
      borderWidth: 1,
      borderColor: '#6a0dad99',
      yAxisID: 'yNps',
      backgroundColor: (ctx: any) => {
        const chart = ctx.chart;
        const { ctx: c, chartArea } = chart;
        if (!chartArea) return 'rgba(106,13,173,0.15)';
        const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0, 'rgba(128,0,255,0.15)');
        gradient.addColorStop(1, 'rgba(0,128,255,0.05)');
        return gradient;
      },
    });
  }

  if (missTimes.length > 0) {
    const allY = Object.values(groups)
      .flat()
      .map((p) => Math.abs(p.y));
    const maxWindow = windows[windows.length - 1]?.maxOffset || 0.2;
    const yRange = Math.max(maxWindow, ...allY);
    const padded = yRange * 1;
    for (const x of missTimes) {
      datasets.push({
        label: '',
        data: [
          { x, y: -padded },
          { x, y: padded },
        ],
        backgroundColor: JUDGMENT_COLORS['Miss'],
        borderColor: JUDGMENT_COLORS['Miss'],
        borderWidth: 1,
        pointRadius: 0,
        pointHoverRadius: 0,
        showLine: true,
        fill: false,
        type: 'line' as const,
        tension: 0,
      });
    }
  }

  const hasLifebar = Array.isArray(play.lifebarInfo) && play.lifebarInfo.length > 0;
  if (hasLifebar) {
    datasets.push({
      label: 'Lifebar %',
      data: play.lifebarInfo!.map((p) => ({ x: p.x, y: p.y })),
      borderColor: '#FFFFFF',
      backgroundColor: 'rgba(255, 107, 107, 0.1)',
      borderWidth: 5,
      pointRadius: 0,
      pointHoverRadius: 0,
      showLine: true,
      fill: false,
      type: 'line' as const,
      yAxisID: 'y1',
      tension: 0.25,
    });
  }

  const data = { datasets };

  // Create cumulative judgment counts for hover display
  const cumulativeCounts = useMemo(() => {
    // Flatten all timing points with their judgments
    const allPoints: Array<{ time: number; judgment: string }> = [];

    for (const [t, off] of timing) {
      if (off === 'Miss') {
        allPoints.push({ time: t, judgment: 'Miss' });
      } else if (typeof off === 'number') {
        const abs = Math.abs(off);
        const win = windows.find((w) => abs <= w.maxOffset);
        const name = win ? win.name : 'Miss';
        allPoints.push({ time: t, judgment: name });
      }
    }

    // Sort by time
    allPoints.sort((a, b) => a.time - b.time);

    return allPoints;
  }, [timing, windows]);

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      // Custom plugin to draw vertical line and show cumulative counts
      crosshair: {
        line: {
          color: '#aaaaaa',
          width: 1,
          dashPattern: [5, 5],
        },
      },
      legend: {
        display: false,
        position: 'right',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 10,
          font: { size: 10 },
          boxWidth: 12,
          boxHeight: 12,
          color: '#aaaaaa',
          generateLabels: (chart: any) => {
            const original = ChartJS.defaults.plugins.legend.labels.generateLabels;
            const labels = original(chart);
            return labels.filter((l: any) => l.text && l.text !== '');
          },
        },
      },
      tooltip: {
        enabled: false,
        mode: 'nearest',
        axis: 'x',
        intersect: false,
        position: 'mouse',
        external: (context: any) => {
          // Tooltip Element
          let tooltipEl = document.getElementById('chartjs-tooltip');

          // Create element on first render
          if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'chartjs-tooltip';
            tooltipEl.style.background = 'rgba(0, 0, 0, 0.9)';
            tooltipEl.style.borderRadius = '6px';
            tooltipEl.style.color = 'white';
            tooltipEl.style.opacity = '1';
            tooltipEl.style.pointerEvents = 'none';
            tooltipEl.style.position = 'absolute';
            tooltipEl.style.transform = 'translate(-50%, -100%)';
            tooltipEl.style.transition = 'all .1s ease';
            tooltipEl.style.padding = '8px';
            tooltipEl.style.fontSize = '11px';
            tooltipEl.style.fontFamily = 'inherit';
            tooltipEl.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            tooltipEl.style.zIndex = '1000';
            document.body.appendChild(tooltipEl);
          }

          // Hide if no tooltip
          const tooltipModel = context.tooltip;
          if (tooltipModel.opacity === 0) {
            tooltipEl.style.opacity = '0';
            return;
          }

          // Get the x position from the chart
          const position = context.chart.canvas.getBoundingClientRect();
          const xValue = tooltipModel.dataPoints?.[0]?.parsed?.x ?? 0;

          // Calculate cumulative counts up to this time
          const counts: Record<string, number> = {};
          for (const point of cumulativeCounts) {
            if (point.time <= xValue) {
              counts[point.judgment] = (counts[point.judgment] || 0) + 1;
            }
          }

          // Build the HTML content - filter judgments based on active scoring system
          const allJudgments = ['Fantastic (10ms)', 'Fantastic (15ms)', 'Fantastic (23ms)', 'Excellent', 'Great', 'Decent', 'Way Off', 'Miss'];
          const judgmentOrder = allJudgments.filter((j) => {
            // Filter out irrelevant windows based on scoring system
            if (j === 'Fantastic (10ms)' && scoring.name !== 'Hard EX') return false;
            if (j === 'Fantastic (15ms)' && scoring.name !== 'EX') return false;
            if ((j === 'Fantastic (10ms)' || j === 'Fantastic (15ms)') && scoring.name === 'ITG') return false;
            return true;
          });

          let innerHtml = `<div style="font-weight: bold; margin-bottom: 6px; font-size: 12px;">${Number(xValue).toFixed(2)}s</div>`;

          for (const judgment of judgmentOrder) {
            const count = counts[judgment] || 0;
            const color = getJudgmentColor(judgment, activeLeaderboard);
            const isWhite = color.toLowerCase() === '#ffffff';

            innerHtml += `
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                <span style="
                  display: inline-block;
                  width: 8px;
                  height: 8px;
                  border-radius: 50%;
                  background-color: ${color};
                  flex-shrink: 0;
                  ${isWhite ? 'box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.4);' : ''}
                "></span>
                <span style="font-size: 10px; white-space: nowrap;">${judgment}: ${count}</span>
              </div>
            `;
          }

          tooltipEl.innerHTML = innerHtml;

          // Display, position, and set styles for font
          tooltipEl.style.opacity = '1';
          tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
          tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + 'px';
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        title: { display: true, text: 'Time (seconds)', font: { size: 12, weight: 'bold' } },
        grid: { drawOnChartArea: false },
      },
      y: {
        type: 'linear',
        title: { display: true, text: 'Timing Offset (milliseconds)', font: { size: 12, weight: 'bold' } },
        grid: {
          color: (ctx: any) => {
            const value = ctx.tick.value as number;
            if (value === 0) return '#666666';
            const abs = Math.abs(value);
            const win = windows.find((w) => Math.abs(w.maxOffset - abs) < 0.0001);
            if (win) {
              const base = getJudgmentColor(win.name, activeLeaderboard);
              const hex = base.replace('#', '');
              const r = parseInt(hex.substring(0, 2), 16);
              const g = parseInt(hex.substring(2, 4), 16);
              const b = parseInt(hex.substring(4, 6), 16);
              return `rgba(${r}, ${g}, ${b}, 0.25)`;
            }
            return '#666666';
          },
        },
        ticks: {
          callback: (value: any) => {
            const num = Number(value);
            const abs = Math.abs(num);
            const isBoundary = windows.some((w) => Math.abs(w.maxOffset - abs) < 0.0001);
            if (isBoundary && num !== 0) return '';
            return (num * 1000).toFixed(0);
          },
        },
        afterBuildTicks: (scale: any) => {
          const offsets = windows.map((w) => w.maxOffset);
          const ticks = [{ value: 0 }, ...offsets.flatMap((o) => [{ value: -o }, { value: o }])];
          ticks.sort((a, b) => a.value - b.value);
          const visible = ticks.filter((t) => t.value >= scale.min && t.value <= scale.max);
          scale.ticks = visible;
        },
      },
      y1: {
        type: 'linear',
        display: hasLifebar,
        position: 'right',
        title: { display: true, text: 'Lifebar %', font: { size: 12, weight: 'bold' } },
        min: 0,
        max: 1,
        ticks: { callback: (v: any) => `${(Number(v) * 100).toFixed(0)}%` },
        grid: { drawOnChartArea: false },
      },
      yNps: {
        type: 'linear',
        display: false, // hide axis; purely for scaling NPS independently
        min: 0,
        max: hasNps ? Math.max(...play.npsData!.map((p: any) => p.y)) * 1.05 : 1,
        grid: { drawOnChartArea: false },
      },
    },
    elements: { point: { radius: 2, hoverRadius: 2 } },
    onHover: (event: any, activeElements: any[], chart: any) => {
      chart.canvas.style.cursor = activeElements.length ? 'crosshair' : 'default';
    },
  };

  // Custom plugin to draw vertical crosshair line
  const crosshairPlugin = {
    id: 'crosshair',
    afterDatasetsDraw: (chart: any) => {
      if (chart.tooltip?._active?.length) {
        const ctx = chart.ctx;
        const x = chart.tooltip.caretX;
        const topY = chart.chartArea.top;
        const bottomY = chart.chartArea.bottom;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.restore();
      }
    },
  };

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body">
        <h3 className="card-title text-lg mb-4 flex items-center gap-2">
          <Activity size={18} className="text-primary" />
          <FormattedMessage defaultMessage="Timing Chart" id="MrInI2" description="Title for the timing chart section on the play page" />
        </h3>
        {/* Timing Stats */}
        {stats && stats.meanMs !== null ? (
          <div className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mean Absolute Error */}
              <div className="card bg-base-100/40 shadow-sm">
                <div className="card-body p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-base-content/60 mb-1">
                        <FormattedMessage
                          defaultMessage="Mean absolute error"
                          id="kebfPM"
                          description="Title for the mean absolute error stat on the timing chart"
                        />
                      </div>
                      <div className="text-2xl font-bold text-primary tabular-nums mb-1">
                        <FormattedMessage
                          defaultMessage="{value,number, ::.00} ms"
                          id="hllRnT"
                          description="Value display for milliseconds"
                          values={{ value: stats.meanAbsMs }}
                        />
                      </div>
                      <div className="text-xs text-base-content/50">
                        <FormattedMessage
                          defaultMessage="Overall timing average"
                          id="ejXDAu"
                          description="Description for the mean absolute error stat on the timing chart"
                        />
                      </div>
                    </div>
                    <div className="text-primary flex-shrink-0">
                      <Sigma size={20} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Mean Offset (signed) */}
              <div className="card bg-base-100/40 shadow-sm">
                <div className="card-body p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-base-content/60 mb-1">
                        <FormattedMessage defaultMessage="Mean Offset" id="FkqFg3" description="Title for the mean offset stat on the timing chart" />
                      </div>
                      <div className="text-2xl font-bold text-primary tabular-nums mb-1">
                        <FormattedMessage
                          defaultMessage="{value,number, ::.00} ms"
                          id="hllRnT"
                          description="Value display for milliseconds"
                          values={{ value: stats.meanMs }}
                        />
                      </div>
                      <div className="text-xs text-base-content/50">
                        <FormattedMessage
                          defaultMessage="Did you avg. late (+) or early (-)"
                          id="0ZhmWz"
                          description="Description for the mean offset stat on the timing chart"
                        />
                      </div>
                    </div>
                    <div className="text-primary flex-shrink-0">
                      <Sigma size={20} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Std Dev^3 */}
              <div className="card bg-base-100/40 shadow-sm">
                <div className="card-body p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-base-content/60 mb-1">
                        <FormattedMessage
                          defaultMessage="Std.Dev.^3"
                          id="/MH50s"
                          description="Title for the standard deviation cubed stat on the timing chart"
                        />
                      </div>
                      <div className="text-2xl font-bold text-accent tabular-nums mb-1">
                        <FormattedMessage
                          defaultMessage="{value,number, ::.00} ms"
                          id="hllRnT"
                          description="Value display for milliseconds"
                          values={{ value: stats.stdMs! * 3 }}
                        />
                      </div>
                      <div className="text-xs text-base-content/50">
                        <FormattedMessage
                          defaultMessage="99.7% of your steps were under this max. value"
                          id="CVXRUi"
                          description="Description for the standard deviation cubed stat on the timing chart"
                        />
                      </div>
                    </div>
                    <div className="text-accent flex-shrink-0">
                      <BarChart3 size={20} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Max Error */}
              <div className="card bg-base-100/40 shadow-sm">
                <div className="card-body p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-base-content/60 mb-1">
                        <FormattedMessage defaultMessage="Max Error" id="Qo+oY5" description="Title for the max error stat on the timing chart" />
                      </div>
                      <div className="text-2xl font-bold text-secondary tabular-nums mb-1">
                        <FormattedMessage
                          defaultMessage="{value,number, ::.00} ms"
                          id="hllRnT"
                          description="Value display for milliseconds"
                          values={{ value: stats.maxErrMs }}
                        />
                      </div>
                      <div className="text-xs text-base-content/50">
                        <FormattedMessage
                          defaultMessage="Your worst judgment/outlier"
                          id="5X2Z64"
                          description="Description for the max error stat on the timing chart"
                        />
                      </div>
                    </div>
                    <div className="text-secondary flex-shrink-0">
                      <Maximize2 size={20} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-base-content/60 mb-4">
            <FormattedMessage
              defaultMessage="No timing stats available."
              id="xqsuVH"
              description="Message shown when no timing stats are available for a play"
            />
          </div>
        )}
        {timing && timing.length > 0 ? (
          <div className="bg-black/80 p-2 sm:p-4 overflow-x-auto">
            <div className="w-full" style={{ aspectRatio: '16/9', minHeight: '250px', maxHeight: '500px' }}>
              <Scatter data={data} options={options} plugins={[crosshairPlugin]} />
            </div>
          </div>
        ) : (
          <div className="text-sm text-base-content/60">
            <FormattedMessage
              defaultMessage="No timing data available for this play."
              id="FrimqV"
              description="Message shown when no timing data is available for a play"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const PlayPage: React.FC = () => {
  const { playId } = useParams<{ playId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [play, setPlay] = useState<PlayDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const { formatMessage } = useIntl();

  const handleDelete = async () => {
    if (!playId || !play) return;

    setDeleteLoading(true);
    try {
      await deletePlay(Number(playId));
      // Navigate to user's profile or chart page after successful deletion
      navigate(`/chart/${play.chart.hash}`, {
        replace: true,
        state: {
          message: formatMessage({
            defaultMessage: 'Score deleted successfully',
            id: 'o7+BG1',
            description: 'Message shown after a score is successfully deleted',
          }),
        },
      });
    } catch (e) {
      console.error('Error deleting play:', e);
      setError(
        e instanceof Error
          ? e.message
          : formatMessage({ defaultMessage: 'Failed to delete score', id: 'TtSTfd', description: 'Error message shown when failing to delete a score' }),
      );
    } finally {
      setDeleteLoading(false);
      setShowDeleteModal(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!playId) {
        setError(formatMessage({ defaultMessage: 'Play ID is required', id: 'ZeU0+7', description: 'Error message shown when play ID is missing' }));
        setLoading(false);
        return;
      }
      try {
        setError(null);
        setLoading(true);
        const data = await getPlay(Number(playId));
        setPlay(data);
      } catch (e) {
        console.error(e);
        setError(
          e instanceof Error
            ? e.message
            : formatMessage({ defaultMessage: 'Failed to load play', id: 'vgnvnd', description: 'Error message shown when failing to load a play' }),
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [playId]);

  return (
    <AppPageLayout>
      <div className="container mx-auto px-4 pt-20 mt-6">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 size={48} className="animate-spin text-primary" />
          </div>
        ) : error ? (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        ) : !play ? (
          <Alert variant="error" className="mb-6">
            <FormattedMessage defaultMessage="Play not found" id="kuM6D7" description="Error message shown when a play is not found" />
          </Alert>
        ) : (
          <div className="space-y-8">
            {/* Full-width header */}
            <PlayHeader play={play} onShare={() => setShowShareModal(true)} />

            {/* Main content grid: judgments/radar/toggles on left, timing chart on right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left column: Leaderboard toggle, Judgments, and Radar Data */}
              <div className="lg:col-span-4 space-y-6">
                <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
                  <div className="card-body">
                    <h3 className="card-title text-lg mb-2">
                      <FormattedMessage defaultMessage="Scoring System" id="OuTVaI" description="Title for the scoring system toggle section" />
                    </h3>
                    <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
                  </div>
                </div>
                <JudgmentsSection play={play} />
                <RadarDataSection play={play} />
              </div>

              {/* Right column: Timing Chart */}
              <div className="lg:col-span-8">
                <TimingChartSection play={play} />
              </div>
            </div>

            {/* Delete button below chart */}
            {user && user.id === play.user.id && (
              <div>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="btn btn-sm btn-error gap-2"
                  title={formatMessage({ defaultMessage: 'Delete this score', id: 'Xdhai4', description: 'Button title to delete a score' })}
                >
                  <Trash2 size={16} />
                  <FormattedMessage defaultMessage="Delete Score" id="TiJDoq" description="Button text to delete a score" />
                </button>
              </div>
            )}

            {/* Share Dialog */}
            <ShareDialog play={play} isOpen={showShareModal} onClose={() => setShowShareModal(false)} />

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
              <div className="modal modal-open">
                <div className="modal-box">
                  <h3 className="font-bold text-lg">
                    <FormattedMessage defaultMessage="Delete Score" id="DUif3G" description="Title for the delete score confirmation modal" />
                  </h3>
                  <p className="py-4">
                    <FormattedMessage
                      defaultMessage="Are you sure you want to delete this score? This action cannot be undone."
                      id="guUuZ7"
                      description="Confirmation message for deleting a score"
                    />
                  </p>
                  <div className="modal-action">
                    <button className="btn btn-ghost" onClick={() => setShowDeleteModal(false)} disabled={deleteLoading}>
                      <FormattedMessage defaultMessage="Cancel" id="hHNj31" description="Cancel button text" />
                    </button>
                    <button className="btn btn-error" onClick={handleDelete} disabled={deleteLoading}>
                      {deleteLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <FormattedMessage defaultMessage="Deleting..." id="Ejaumd" description="Text shown while a delete operation is in progress" />
                        </>
                      ) : (
                        <>
                          <Trash2 size={16} />
                          <FormattedMessage defaultMessage="Delete Score" id="MjDpNZ" description="Button text for deleting a score" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="modal-backdrop" onClick={() => !deleteLoading && setShowDeleteModal(false)} />
              </div>
            )}
          </div>
        )}
      </div>
    </AppPageLayout>
  );
};

export default PlayPage;
