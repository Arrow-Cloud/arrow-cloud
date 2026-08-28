#!/usr/bin/env tsx
/**
 * Local feasibility test for rendering the pack-leaderboard "results card" with satori + resvg
 * instead of headless Chromium (share-service). Entirely local - no AWS, no DB, mock data only.
 *
 * Renders a mock pack-leaderboard results card to a PNG and logs timing for the satori layout
 * pass and the resvg rasterization pass separately, so we can confirm rendering is comfortably
 * under the ~500ms target before investing in the real backend/rendering pipeline.
 *
 * Usage:
 *   npx tsx scripts/satori-poc.ts [--font <path>] [--font-bold <path>] [--logo <path>] [--out <path>] [--runs <n>]
 *
 * Examples:
 *   npx tsx scripts/satori-poc.ts
 *   npx tsx scripts/satori-poc.ts --font /path/to/Inter-Regular.ttf --font-bold /path/to/Inter-Bold.ttf
 *   npx tsx scripts/satori-poc.ts --runs 20   # average timings over multiple renders (post-warm-up)
 *
 * Notes:
 * - satori needs font data as an in-memory buffer up front - it cannot fetch @font-face URLs at
 *   render time (unlike share-service's Chromium templates, which pull fonts from Google Fonts
 *   live). This is the mechanism that removes that entire class of slowness.
 * - No brand font files exist in this repo yet (share-service pulls 'Miso'/'Azeret Mono' from
 *   Google Fonts CSS at render time). Defaults below point at system DejaVu Sans fonts just to
 *   get a real render + real timings; swap in the actual brand fonts (as local .ttf files) once
 *   sourced, via --font/--font-bold.
 * - Raster images work the same way: satori embeds whatever `src` an <img> is given directly into
 *   the output SVG, and resvg does NOT fetch remote URLs at render time - so, same as fonts, any
 *   image needs to be loaded locally and passed in as a data URI up front. scripts/assets/ac-logo.png
 *   is a one-time local copy of the same logo share-service's templates already reference remotely
 *   (https://assets.arrowcloud.dance/logos/20250725/ac%20logo.png) - swap via --logo if needed.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// Target aspect ratio 1:1.25 (taller than wide) - a fixed canvas size regardless of how many
// leaderboards a given player has configured; content doesn't need to fill it, but the client
// gets a consistent image size to lay out every time.
const CARD_WIDTH = 480;
const CARD_HEIGHT = 600;

// Matches the leaderboard color convention already established across the frontend
// (frontend/src/types/leaderboards.ts, SessionPage.tsx, PackLeaderboardPanel.tsx).
const LEADERBOARD_COLORS: Record<string, string> = {
  HardEX: '#FF69B4',
  EX: '#21CCE8',
  ITG: '#FFFFFF',
  ITGRate: '#C9C9FF',
  EXRate: '#7BE0F0',
};

// Matches the existing green/red delta convention (SessionPage.tsx, PackLeaderboardPanel.tsx).
const DELTA_UP = '#36d399';
const DELTA_DOWN = '#f87272';

// Matches the existing difficulty label convention (PackLeaderboardPanel.tsx's DIFFICULTY_LABELS).
const DIFFICULTY_LABELS: Record<'medium' | 'hard' | 'challenge', string> = { medium: 'Medium', hard: 'Hard', challenge: 'Expert' };

// Title treatment gradient - reuses two of the leaderboard accent colors (EX cyan -> HardEX pink)
// so the "flashy" title ties back into the same color language as the leaderboard tiles below it.
const TITLE_GRADIENT: [string, string] = [LEADERBOARD_COLORS.EX, LEADERBOARD_COLORS.HardEX];

// Real chart-points curve (api/src/utils/pack-leaderboard.ts's scoreToCurvedPoints): 1000 max per
// chart, flat 200 for any score up to 80%, then 8 buckets of 100 points each from 80->100. This is
// a rough approximation of that curve for mock purposes only (no need to reproduce it exactly).
function approxChartPoints(score: number): number {
  if (score <= 80) return (score / 80) * 200;
  const buckets = [80, 85, 90, 92, 94, 96, 98, 99, 100];
  for (let i = 0; i < buckets.length - 1; i++) {
    const [lo, hi] = [buckets[i], buckets[i + 1]];
    if (score <= hi) return 200 + i * 100 + ((score - lo) / (hi - lo)) * 100;
  }
  return 1000;
}

interface MockResultsCardEntry {
  leaderboardKey: keyof typeof LEADERBOARD_COLORS;
  label: string;
  score: number; // 0-100, this play's score on the chart
  scoreDelta: number; // vs. previous best on this chart, percentage points
  chartPoints: number; // 0-1000 max, this chart's curved points at the new score
  chartPointsDelta: number; // vs. previous best on this chart, always within +/-1000
  packTotal: number; // sum of curved points across every chart in the pack (31 charts here, so 0-31000 max)
  packTotalDelta: number; // always equal to chartPointsDelta - a play only ever changes one chart's contribution
  rank: number;
  totalParticipants: number;
}

interface MockResultsCardData {
  playerAlias: string;
  chartTitle: string;
  chartArtist: string;
  packName: string;
  packChartCount: number;
  difficulty: 'medium' | 'hard' | 'challenge';
  meter: number;
  entries: MockResultsCardEntry[];
}

// A play only ever changes ONE chart's contribution to a pack total, so chartPointsDelta and
// packTotalDelta are always the same value - build entries from (score, previousScore, packTotal)
// rather than inventing the two deltas independently.
function buildEntry(
  leaderboardKey: keyof typeof LEADERBOARD_COLORS,
  label: string,
  score: number,
  previousScore: number,
  packTotalBefore: number,
  rank: number,
  totalParticipants: number,
): MockResultsCardEntry {
  const chartPoints = approxChartPoints(score);
  const chartPointsBefore = approxChartPoints(previousScore);
  const chartPointsDelta = Math.round(chartPoints - chartPointsBefore);
  return {
    leaderboardKey,
    label,
    score,
    scoreDelta: Math.round((score - previousScore) * 100) / 100,
    chartPoints: Math.round(chartPoints),
    chartPointsDelta,
    packTotal: packTotalBefore + chartPointsDelta,
    packTotalDelta: chartPointsDelta,
    rank,
    totalParticipants,
  };
}

const MOCK_DATA: MockResultsCardData = {
  playerAlias: 'Wafles',
  chartTitle: 'Crystal Clearer',
  chartArtist: 'modus',
  packName: "Snap's Schmoovement Saga 2",
  packChartCount: 31,
  difficulty: 'challenge',
  meter: 12,
  entries: [
    buildEntry('HardEX', 'H.EX', 91.23, 92.1, 24350, 4, 66),
    buildEntry('EX', 'EX', 96.45, 95.25, 30180, 1, 66),
    buildEntry('ITG', 'ITG', 94.1, 94.1, 27100, 2, 66),
  ],
};

// --- Tiny hyperscript helper so we don't need JSX/tsconfig changes for a standalone script ---
type Node = { type: string; props: Record<string, unknown> };
type Child = Node | string | null | undefined | false;
function h(type: string, props: Record<string, unknown> = {}, ...children: (Child | Child[])[]): Node {
  const flatChildren = children.flat().filter((c): c is Node | string => c !== null && c !== undefined && c !== false);
  return { type, props: { ...props, children: flatChildren.length === 1 ? flatChildren[0] : flatChildren } };
}

function fmtPoints(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100000) return `${Math.round(n / 1000)}k`;
  if (abs >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtPointsDelta(delta: number): { text: string; color: string } {
  if (delta > 0) return { text: `+${fmtPoints(delta)}`, color: DELTA_UP };
  if (delta < 0) return { text: `-${fmtPoints(Math.abs(delta))}`, color: DELTA_DOWN };
  return { text: '±0', color: 'rgba(255,255,255,0.5)' };
}

function fmtScoreDelta(delta: number): { text: string; color: string } {
  if (delta > 0) return { text: `+${delta.toFixed(2)}%`, color: DELTA_UP };
  if (delta < 0) return { text: `-${Math.abs(delta).toFixed(2)}%`, color: DELTA_DOWN };
  return { text: '±0.00%', color: 'rgba(255,255,255,0.5)' };
}

function buildCard(data: MockResultsCardData, logoDataUri: string) {
  const LOGO_SIZE = 340;
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: '#1a1a24',
        padding: 20,
        fontFamily: 'Nunito',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
      },
    },
    // Subtle background watermark - painted first so later (foreground) content sits on top of it.
    h('img', {
      src: logoDataUri,
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      style: {
        position: 'absolute',
        top: (CARD_HEIGHT - LOGO_SIZE) / 2,
        left: (CARD_WIDTH - LOGO_SIZE) / 2,
        opacity: 0.06,
      },
    }),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 } },
      // Flashy eyebrow title: gradient-filled text flanked by matching gradient bars.
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 } },
        h('div', { style: { display: 'flex', width: 28, height: 2, backgroundImage: `linear-gradient(90deg, transparent, ${TITLE_GRADIENT[1]})` } }),
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontFamily: 'Miso',
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: 3,
              textTransform: 'uppercase',
              backgroundImage: `linear-gradient(90deg, ${TITLE_GRADIENT[0]}, ${TITLE_GRADIENT[1]})`,
              backgroundClip: 'text',
              color: 'transparent',
            },
          },
          'Pack Leaderboard',
        ),
        h('div', { style: { display: 'flex', width: 28, height: 2, backgroundImage: `linear-gradient(270deg, transparent, ${TITLE_GRADIENT[0]})` } }),
      ),
      h('div', { style: { display: 'flex', fontSize: 19, fontWeight: 700 } }, data.packName),
      h(
        'div',
        { style: { display: 'flex', fontSize: 12, color: 'rgba(255,255,255,0.5)', gap: 6, marginTop: 2 } },
        h('span', {}, data.chartTitle),
        h('span', {}, '·'),
        h('span', {}, data.chartArtist),
        h('span', {}, '·'),
        h('span', {}, `${DIFFICULTY_LABELS[data.difficulty]} ${data.meter}`),
      ),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
      ...data.entries.map((entry) => {
        const scoreDelta = fmtScoreDelta(entry.scoreDelta);
        const chartPointsDelta = fmtPointsDelta(entry.chartPointsDelta);
        const color = LEADERBOARD_COLORS[entry.leaderboardKey];

        // A stat with a small label above a big value (+ optional delta) - reused for all four quadrants.
        const stat = (label: string, value: string, delta?: { text: string; color: string }, align: 'left' | 'right' = 'left') =>
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', flex: 1, alignItems: align === 'right' ? 'flex-end' : 'flex-start' } },
            h(
              'div',
              { style: { display: 'flex', fontFamily: 'Miso', fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.4)' } },
              label,
            ),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'baseline', gap: 6 } },
              h('div', { style: { display: 'flex', fontSize: 20, fontWeight: 700 } }, value),
              delta && h('div', { style: { display: 'flex', fontSize: 12, fontWeight: 700, color: delta.color } }, delta.text),
            ),
          );

        return h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: 10,
              padding: 12,
              gap: 10,
            },
          },
          // Top row: scoring system name (+ rank tucked underneath) | score + delta
          h(
            'div',
            { style: { display: 'flex' } },
            h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
              h('div', { style: { display: 'flex', fontFamily: 'Miso', fontSize: 18, fontWeight: 700, color } }, entry.label),
              h('div', { style: { display: 'flex', fontSize: 11, color: 'rgba(255,255,255,0.5)' } }, `#${entry.rank} of ${entry.totalParticipants}`),
            ),
            stat('SCORE', `${entry.score.toFixed(2)}%`, scoreDelta, 'right'),
          ),
          // Bottom row: pack total | chart points + delta
          h(
            'div',
            { style: { display: 'flex', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' } },
            stat('PACK TOTAL', fmtPoints(entry.packTotal)),
            stat('CHART PTS', `${fmtPoints(entry.chartPoints)} / 1k`, chartPointsDelta, 'right'),
          ),
        );
      }),
    ),
  );
}

function parseArgs(argv: string[]) {
  const get = (flag: string, fallback: string) => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : fallback;
  };
  return {
    // Same two fonts the live site uses for its own "share-style" renders (see share-service's
    // image-template.ts and frontend/index.html) - Miso for flashy display/label text, Nunito for
    // body/numeric content. Both are variable fonts (one file covers the whole weight range).
    bodyFontPath: get('--font', path.resolve('scripts/assets/fonts/nunito-400.woff')),
    bodyFontBoldPath: get('--font-bold', path.resolve('scripts/assets/fonts/nunito-800.woff')),
    labelFontPath: get('--font-label', path.resolve('scripts/assets/fonts/miso-light.ttf')),
    logoPath: get('--logo', path.resolve('scripts/assets/ac-logo.png')),
    outPath: get('--out', path.resolve('scripts/output/pack-leaderboard-poc.png')),
    runs: parseInt(get('--runs', '1'), 10) || 1,
  };
}

async function main() {
  const { bodyFontPath, bodyFontBoldPath, labelFontPath, logoPath, outPath, runs } = parseArgs(process.argv.slice(2));

  console.log(`Loading fonts:\n  body (Nunito):       ${bodyFontPath}\n  body bold (Nunito):  ${bodyFontBoldPath}\n  label (Miso):        ${labelFontPath}`);
  const [bodyData, bodyBoldData, labelData] = [readFileSync(bodyFontPath), readFileSync(bodyFontBoldPath), readFileSync(labelFontPath)];

  const fonts = [
    { name: 'Nunito', data: bodyData, weight: 400 as const, style: 'normal' as const },
    { name: 'Nunito', data: bodyBoldData, weight: 700 as const, style: 'normal' as const },
    { name: 'Miso', data: labelData, weight: 700 as const, style: 'normal' as const },
    { name: 'Miso', data: labelData, weight: 800 as const, style: 'normal' as const },
  ];

  console.log(`Loading logo: ${logoPath}`);
  const logoDataUri = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`;

  const tree = buildCard(MOCK_DATA, logoDataUri);

  const satoriTimes: number[] = [];
  const resvgTimes: number[] = [];
  let pngBuffer: Buffer = Buffer.alloc(0);

  for (let i = 0; i < runs; i++) {
    const satoriStart = performance.now();
    const svg = await satori(tree as never, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });
    satoriTimes.push(performance.now() - satoriStart);

    const resvgStart = performance.now();
    const resvgInstance = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
    pngBuffer = Buffer.from(resvgInstance.render().asPng());
    resvgTimes.push(performance.now() - resvgStart);
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, pngBuffer);

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const fmt = (ms: number) => `${ms.toFixed(1)}ms`;

  console.log(`\nWrote ${outPath} (${pngBuffer.length} bytes)`);
  console.log(`\nRuns: ${runs}`);
  console.log(`satori (layout -> SVG):   avg ${fmt(avg(satoriTimes))}  first ${fmt(satoriTimes[0])}  last ${fmt(satoriTimes[satoriTimes.length - 1])}`);
  console.log(`resvg (SVG -> PNG):       avg ${fmt(avg(resvgTimes))}  first ${fmt(resvgTimes[0])}  last ${fmt(resvgTimes[resvgTimes.length - 1])}`);
  const totalAvg = avg(satoriTimes) + avg(resvgTimes);
  console.log(`total (avg):              ${fmt(totalAvg)}`);
  console.log(totalAvg < 500 ? '\n✅ well under the 500ms target' : '\n⚠️  at/over the 500ms target');
}

main().catch((err) => {
  console.error('satori-poc failed:', err);
  process.exit(1);
});
