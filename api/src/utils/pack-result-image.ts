/**
 * Renders the post-submission pack-leaderboard "results card" PNG shown to the player right after
 * a score submission. Ported from scripts/satori-poc.ts (see that script's header for the design
 * rationale/history). Uses satori (JSX-like layout -> SVG, no browser) + @resvg/resvg-js
 * (SVG -> PNG rasterization) instead of share-service's headless-Chromium pipeline, since neither
 * step does any network I/O at render time - fonts and the logo watermark are loaded once into
 * memory at module scope below and reused across warm Lambda invocations.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const CARD_WIDTH = 480;
const CARD_HEIGHT = 600;

const LEADERBOARD_COLORS: Record<string, string> = {
  HardEX: '#FF69B4',
  EX: '#21CCE8',
  ITG: '#FFFFFF',
  ITGRate: '#C9C9FF',
  EXRate: '#7BE0F0',
};

const DELTA_UP = '#36d399';
const DELTA_DOWN = '#f87272';

const DIFFICULTY_LABELS: Record<'medium' | 'hard' | 'challenge', string> = { medium: 'Medium', hard: 'Hard', challenge: 'Expert' };

const TITLE_GRADIENT: [string, string] = [LEADERBOARD_COLORS.EX, LEADERBOARD_COLORS.HardEX];

// This module is compiled into a single dist/index.js in the deployed Lambda bundle, and
// api/webpack.config.js's copy-webpack-plugin step places assets/ alongside it (dist/assets/) -
// so __dirname (dist/) + 'assets' resolves correctly there. This path only resolves correctly
// post-build, not when running this file directly from source (ts-node/jest).
const ASSETS_DIR = path.join(__dirname, 'assets');

// Lazily loaded (and memoized) on first render, not at module import time - this file's
// __dirname-relative asset paths only resolve correctly post-webpack-build (see ASSETS_DIR above),
// so eagerly reading them at import time would throw in any context that imports this module
// without going through that build (e.g. jest, which compiles from source via ts-jest).
let fonts: { name: string; data: Buffer; weight: 400 | 700; style: 'normal' }[] | undefined;
function loadFonts() {
  if (!fonts) {
    const [regularData, boldData] = [
      readFileSync(path.join(ASSETS_DIR, 'fonts', 'DejaVuSans.ttf')),
      readFileSync(path.join(ASSETS_DIR, 'fonts', 'DejaVuSans-Bold.ttf')),
    ];
    fonts = [
      { name: 'Body', data: regularData, weight: 400, style: 'normal' },
      { name: 'Body', data: boldData, weight: 700, style: 'normal' },
    ];
  }
  return fonts;
}

let logoDataUri: string | undefined;
function loadLogoDataUri() {
  if (!logoDataUri) {
    logoDataUri = `data:image/png;base64,${readFileSync(path.join(ASSETS_DIR, 'ac-logo.png')).toString('base64')}`;
  }
  return logoDataUri;
}

export interface PackResultImageEntry {
  leaderboardKey: keyof typeof LEADERBOARD_COLORS;
  label: string;
  score: number; // 0-100, this play's score on the chart
  scoreDelta: number; // vs. previous best on this chart, percentage points
  chartPoints: number; // 0-1000 max, this chart's curved points at the new score
  chartPointsDelta: number; // vs. previous best on this chart, always within +/-1000
  packTotal: number; // sum of curved points across every chart in the pack
  rank: number;
  totalParticipants: number;
}

export interface PackResultImageData {
  chartTitle: string;
  chartArtist: string;
  packName: string;
  difficulty: 'medium' | 'hard' | 'challenge';
  meter: number;
  entries: PackResultImageEntry[];
}

// --- Tiny hyperscript helper (mirrors scripts/satori-poc.ts - no JSX/tsconfig changes needed) ---
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

function buildCard(data: PackResultImageData, logoDataUri: string) {
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
        fontFamily: 'Body',
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
              fontSize: 22,
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
            h('div', { style: { display: 'flex', fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.4)' } }, label),
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
              h('div', { style: { display: 'flex', fontSize: 16, fontWeight: 700, color } }, entry.label),
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

export async function renderPackResultImage(data: PackResultImageData): Promise<Buffer> {
  const tree = buildCard(data, loadLogoDataUri());
  const svg = await satori(tree as never, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: loadFonts() });
  const resvgInstance = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
  return Buffer.from(resvgInstance.render().asPng());
}
