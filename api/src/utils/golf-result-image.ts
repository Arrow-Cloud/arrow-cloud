/**
 * Renders the golf-event result card PNG - this play's stroke total, delta vs. previous best, and
 * a "pin-proximity dispersion chart" (each tap note plotted on a deterministically-random green
 * shape seeded by chart hash - see buildDispersionChart below). Ported from
 * scripts/golf-satori-poc.ts (see that script's header for the full design rationale/history) -
 * same satori (layout -> SVG) + @resvg/resvg-js (SVG -> PNG) pipeline as pack-result-image.ts,
 * fonts/logo loaded once into memory at module scope and reused across warm Lambda invocations.
 *
 * Scope for this rollout (see docs/plans/golf-event-result-images.md): just this one card - no
 * hole/course leaderboard pages yet, and no "course name" line (no real course/pack-mapping data
 * source for golf events exists yet, so nothing invented here).
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const SCALE = 2;
const s = (n: number) => n * SCALE;
const CARD_WIDTH = s(480);
const CARD_HEIGHT = s(600);

const STROKE_GOOD = '#36d399';
const STROKE_BAD = '#f87272';

// See pack-result-image.ts's identical comment - this only resolves correctly post-webpack-build
// (api/webpack.config.js's copy-webpack-plugin places assets/ alongside dist/index.js), not when
// running this file directly from source.
const ASSETS_DIR = path.join(__dirname, 'assets');

let fonts: { name: string; data: Buffer; weight: 400 | 700; style: 'normal' }[] | undefined;
function loadFonts() {
  if (!fonts) {
    const [nunitoRegular, nunitoBold, miso] = [
      readFileSync(path.join(ASSETS_DIR, 'fonts', 'nunito-400.woff')),
      readFileSync(path.join(ASSETS_DIR, 'fonts', 'nunito-800.woff')),
      readFileSync(path.join(ASSETS_DIR, 'fonts', 'miso-light.ttf')),
    ];
    fonts = [
      { name: 'Nunito', data: nunitoRegular, weight: 400, style: 'normal' },
      { name: 'Nunito', data: nunitoBold, weight: 700, style: 'normal' },
      { name: 'Miso', data: miso, weight: 700, style: 'normal' },
    ];
  }
  return fonts;
}

let acLogoDataUri: string | undefined;
let headerLogoDataUri: string | undefined;
let patternDataUri: string | undefined;
function loadImageDataUris() {
  if (!acLogoDataUri) {
    acLogoDataUri = `data:image/png;base64,${readFileSync(path.join(ASSETS_DIR, 'ac-logo.png')).toString('base64')}`;
  }
  if (!headerLogoDataUri) {
    headerLogoDataUri = `data:image/png;base64,${readFileSync(path.join(ASSETS_DIR, 'golf', 'ITGolf_Logo-ArrowLeft_Large.png')).toString('base64')}`;
  }
  if (!patternDataUri) {
    patternDataUri = `data:image/png;base64,${readFileSync(path.join(ASSETS_DIR, 'golf', 'arrowpattern.png')).toString('base64')}`;
  }
  return { acLogoDataUri, headerLogoDataUri, patternDataUri };
}

// GolfScoring.lua's strokeColor: green at 0 strokes, red at 99+, sqrt curve so yellow shows up
// around +20 and red ramps in faster than a linear blend would.
function strokeColorHex(strokes: number): string {
  const t = Math.sqrt(Math.min(Math.max(strokes / 99, 0), 1));
  const r = Math.round((0.2 + 0.8 * t) * 255);
  const g = Math.round((1 - 0.85 * t) * 255);
  const b = Math.round(Math.max(0.2 - 0.05 * t, 0) * 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// Deterministic - same chart hash always produces the same green shape (see buildDispersionChart).
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a - deterministic string -> 32-bit seed.
function hashStringToSeed(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Client HUD displays totalStrokes/1000 to 2 decimals (GolfScoring.lua's GolfUpdateCommand).
function fmtStrokes(totalStrokes: number): string {
  return (totalStrokes / 1000).toFixed(2);
}

function fmtStrokeDelta(deltaStrokes: number): { text: string; color: string } {
  if (deltaStrokes < 0) return { text: `-${fmtStrokes(Math.abs(deltaStrokes))}`, color: STROKE_GOOD };
  if (deltaStrokes > 0) return { text: `+${fmtStrokes(deltaStrokes)}`, color: STROKE_BAD };
  return { text: '±0.00', color: 'rgba(255,255,255,0.5)' };
}

// --- Tiny hyperscript helper (mirrors pack-result-image.ts / scripts/satori-poc.ts) ---
type Node = { type: string; props: Record<string, unknown> };
type Child = Node | string | null | undefined | false;
function h(type: string, props: Record<string, unknown> = {}, ...children: (Child | Child[])[]): Node {
  const flatChildren = children.flat().filter((c): c is Node | string => c !== null && c !== undefined && c !== false);
  return { type, props: { ...props, children: flatChildren.length === 1 ? flatChildren[0] : flatChildren } };
}

// Chart titles, artist names, etc. are unbounded-length user content - see pack-result-image.ts's
// identical truncatedLine for the full satori-ellipsis-vs-centering explanation (justifyContent
// center breaks satori's overflow calc; this estimates rendered width up front and only centers
// when that estimate comfortably fits).
const AVG_CHAR_WIDTH_RATIO = 0.56;
function truncatedLine(text: string, maxWidthPx: number, style: Record<string, unknown> = {}) {
  const fontSize = (style.fontSize as number | undefined) ?? s(16);
  const fits = text.length * fontSize * AVG_CHAR_WIDTH_RATIO <= maxWidthPx;
  return h(
    'div',
    {
      style: {
        display: 'flex',
        width: '100%',
        minWidth: 0,
        justifyContent: fits ? 'center' : 'flex-start',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...style,
      },
    },
    text,
  );
}

// --- The pin-proximity dispersion chart ---
// The green is a deterministically-random organic blob, seeded from the chart hash - the same
// chart always renders the same green shape. Each tap note is a dot at (angle = chronological
// position in the chart, radius = distance from pin, scaled against the green's *local* edge in
// that direction so a bad miss visibly lands in the rough no matter which way the blob is
// wobbling). Aggregate mine/hold/roll penalties (flat +200 each) have no per-note identity in the
// submission payload, so they contribute to the hero total but intentionally have no dot here.
interface GreenControlPoint {
  angle: number;
  radius: number;
}

function generateGreenControlPoints(rng: () => number, count: number, baseRadius: number, wobbleFrac: number): GreenControlPoint[] {
  const aspect = 0.55 + rng() * 0.3;
  const rotation = rng() * Math.PI * 2;
  const lobeAmp = 0.08 + rng() * 0.1;
  const lobePhase = rng() * Math.PI * 2;

  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const rel = angle - rotation;
    const ellipseFactor = 1 / Math.sqrt(Math.cos(rel) ** 2 + (Math.sin(rel) / aspect) ** 2);
    const lobeFactor = 1 + lobeAmp * Math.cos(2 * (angle - lobePhase));
    const jitter = 1 + (rng() * 2 - 1) * wobbleFrac;
    return { angle, radius: baseRadius * ellipseFactor * lobeFactor * jitter };
  });
}

function greenRadiusAtAngle(angle: number, points: GreenControlPoint[]): number {
  const n = points.length;
  let a = angle % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  const pos = (a / (Math.PI * 2)) * n;
  const i0 = Math.floor(pos) % n;
  const i1 = (i0 + 1) % n;
  const frac = pos - Math.floor(pos);
  return points[i0].radius + (points[i1].radius - points[i0].radius) * frac;
}

function buildGreenPathD(points: GreenControlPoint[], cx: number, cy: number): string {
  const xy = points.map((p) => ({ x: cx + p.radius * Math.cos(p.angle), y: cy + p.radius * Math.sin(p.angle) }));
  const n = xy.length;
  let d = `M ${xy[0].x.toFixed(2)} ${xy[0].y.toFixed(2)} `;
  for (let i = 0; i < n; i++) {
    const p0 = xy[(i - 1 + n) % n];
    const p1 = xy[i];
    const p2 = xy[(i + 1) % n];
    const p3 = xy[(i + 2) % n];
    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)}, ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
  }
  return `${d}Z`;
}

function buildGreenSvgDataUri(points: GreenControlPoint[], diameter: number): string {
  const d = buildGreenPathD(points, diameter / 2, diameter / 2);
  const svg = `<svg width="${diameter}" height="${diameter}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="rgba(54,211,153,0.16)" stroke="rgba(54,211,153,0.5)" stroke-width="${s(1.5)}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

interface DispersionNote {
  strokes: number;
}

function buildDispersionChart(notes: DispersionNote[], diameter: number, chartHash: string) {
  const R = diameter / 2;
  const rng = mulberry32(hashStringToSeed(chartHash));
  const controlPoints = generateGreenControlPoints(rng, 10, R * 0.5, 0.15);
  const OVERSHOOT = 1.3;

  const jitter01 = (n: number) => {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const greenSvgUri = buildGreenSvgDataUri(controlPoints, diameter);

  const positions = notes.map((note, i) => {
    const angleJitter = (jitter01(i * 2 + 1) - 0.5) * ((Math.PI * 2) / notes.length) * 6;
    const radiusJitter = 1 + (jitter01(i * 2 + 2) - 0.5) * 0.35;
    const angle = -Math.PI / 2 + (i / notes.length) * Math.PI * 2 + angleJitter;
    const localBoundary = greenRadiusAtAngle(angle, controlPoints);
    const t = Math.sqrt(Math.min(note.strokes, 200) / 200);
    const radius = Math.min(localBoundary * Math.max(t, 0.035) * OVERSHOOT * radiusJitter, R * 0.95);
    return { cx: R + radius * Math.cos(angle), cy: R + radius * Math.sin(angle), strokes: note.strokes };
  });

  const dots = positions.map(({ cx, cy, strokes }) => {
    const size = s(3 + (Math.min(strokes, 200) / 200) * 4);
    return h('div', {
      style: {
        display: 'flex',
        position: 'absolute',
        width: size,
        height: size,
        left: cx - size / 2,
        top: cy - size / 2,
        borderRadius: '50%',
        backgroundColor: strokeColorHex(strokes),
      },
    });
  });

  const aceRingSize = s(11);
  const aceRings = positions
    .filter((p) => p.strokes === 0)
    .map(({ cx, cy }) =>
      h('div', {
        style: {
          display: 'flex',
          position: 'absolute',
          width: aceRingSize,
          height: aceRingSize,
          left: cx - aceRingSize / 2,
          top: cy - aceRingSize / 2,
          borderRadius: '50%',
          border: `${s(1.5)}px solid ${STROKE_GOOD}`,
        },
      }),
    );

  const FLAG_HEIGHT = s(24);
  const CUP_SIZE = s(9);

  return h(
    'div',
    { style: { display: 'flex', position: 'relative', width: diameter, height: diameter } },
    h('img', { src: greenSvgUri, width: diameter, height: diameter, style: { position: 'absolute', top: 0, left: 0 } }),
    ...dots,
    ...aceRings,
    h('div', {
      style: {
        display: 'flex',
        position: 'absolute',
        width: CUP_SIZE,
        height: CUP_SIZE,
        left: R - CUP_SIZE / 2,
        top: R - CUP_SIZE / 2,
        borderRadius: '50%',
        backgroundColor: '#0a0a0a',
        border: `${s(1.5)}px solid rgba(255,255,255,0.65)`,
      },
    }),
    h('div', {
      style: {
        display: 'flex',
        position: 'absolute',
        width: s(2),
        height: FLAG_HEIGHT,
        left: R,
        top: R - FLAG_HEIGHT,
        backgroundColor: 'rgba(255,255,255,0.75)',
      },
    }),
    h('div', {
      style: { display: 'flex', position: 'absolute', width: s(11), height: s(7), left: R + s(2), top: R - FLAG_HEIGHT, backgroundColor: STROKE_BAD },
    }),
  );
}

const AC_MARK_SIZE = s(34);
const HEADER_LOGO_WIDTH = s(300);
const HEADER_LOGO_HEIGHT = HEADER_LOGO_WIDTH * (199 / 1346); // ITGolf_Logo-ArrowLeft_Large.png's native aspect ratio (trimmed to its visible glyph bbox)

export interface GolfResultImageData {
  chartTitle: string;
  chartArtist: string;
  chartHash: string;
  totalStrokes: number;
  noteCount: number;
  previousBestStrokes: number | null;
  aceCount: number;
  obCount: number;
  /** Per-note strokes, in chronological order - drives the dispersion chart. */
  noteStrokes: number[];
}

function buildCard(data: GolfResultImageData, images: { headerLogoDataUri: string; acLogoDataUri: string; patternDataUri: string }) {
  const delta = data.previousBestStrokes !== null ? fmtStrokeDelta(data.totalStrokes - data.previousBestStrokes) : undefined;
  const DISPERSION_DIAMETER = s(410);

  const miniStat = (label: string, value: number, color: string) =>
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
      h('div', { style: { display: 'flex', fontFamily: 'Miso', fontSize: s(24), fontWeight: 700, color } }, `${value}`),
      h(
        'div',
        { style: { display: 'flex', fontFamily: 'Miso', fontSize: s(11), fontWeight: 700, letterSpacing: s(1.5), color: 'rgba(255,255,255,0.5)' } },
        label,
      ),
    );

  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: '#101410',
        fontFamily: 'Nunito',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
      },
    },
    h('img', {
      src: images.patternDataUri,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      style: { position: 'absolute', top: 0, left: 0, opacity: 0.1, objectFit: 'cover' },
    }),
    h('img', {
      src: images.acLogoDataUri,
      width: AC_MARK_SIZE,
      height: AC_MARK_SIZE,
      style: { position: 'absolute', top: s(16), right: s(16), opacity: 0.9 },
    }),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: s(20), paddingBottom: 0 } },
      h('img', { src: images.headerLogoDataUri, width: HEADER_LOGO_WIDTH, height: HEADER_LOGO_HEIGHT, style: { display: 'flex' } }),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: s(8) } },
        truncatedLine(data.chartTitle, CARD_WIDTH - s(40), { fontSize: s(18), fontWeight: 700, color: 'rgba(255,255,255,0.9)' }),
        truncatedLine(data.chartArtist, CARD_WIDTH - s(40), { fontSize: s(15), fontWeight: 700, color: 'rgba(255,255,255,0.65)', marginTop: s(1) }),
      ),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: s(10) } },
      h('div', { style: { display: 'flex', fontFamily: 'Miso', fontSize: s(64), fontWeight: 700, color: '#ffffff' } }, fmtStrokes(data.totalStrokes)),
      h(
        'div',
        { style: { display: 'flex', fontFamily: 'Miso', fontSize: s(16), fontWeight: 700, letterSpacing: s(2), color: 'rgba(255,255,255,0.55)' } },
        'STROKES',
      ),
      // No previous best (first play on this chart, or the read-api call failed/timed out) - the
      // card still renders, just without this line, rather than failing or showing a fake delta.
      delta &&
        h('div', { style: { display: 'flex', fontSize: s(20), fontWeight: 700, color: delta.color, marginTop: s(6) } }, `${delta.text} vs. previous best`),
      h(
        'div',
        { style: { display: 'flex', gap: s(20), marginTop: s(10) } },
        miniStat('ACES', data.aceCount, STROKE_GOOD),
        miniStat('OB', data.obCount, STROKE_BAD),
      ),
    ),
    h(
      'div',
      { style: { display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' } },
      buildDispersionChart(
        data.noteStrokes.map((strokes) => ({ strokes })),
        DISPERSION_DIAMETER,
        data.chartHash,
      ),
    ),
  );
}

export async function renderGolfResultImage(data: GolfResultImageData): Promise<Buffer> {
  const tree = buildCard(data, loadImageDataUris());
  const svg = await satori(tree as never, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: loadFonts() });
  const resvgInstance = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
  return Buffer.from(resvgInstance.render().asPng());
}
