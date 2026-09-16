/**
 * Renders the golf-event result card PNG - this play's stroke total, delta vs. previous best, par
 * (when this chart has one - see event-result-images.ts's GOLF_CHARTS), and a "pin-proximity
 * dispersion chart" (each tap note plotted on a deterministically-random green shape seeded by
 * chart hash - see buildDispersionChart below). Ported from scripts/golf-satori-poc.ts (see that
 * script's header for the full design rationale/history, including the iterative par-layout design
 * review) - same satori (layout -> SVG) + @resvg/resvg-js (SVG -> PNG) pipeline as
 * pack-result-image.ts, fonts/logo loaded once into memory at module scope and reused across warm
 * Lambda invocations.
 *
 * Scope for this rollout (see docs/plans/golf-event-result-images.md): just this one card - no
 * hole/course leaderboard pages yet. The course name IS shown (GOLF_CHARTS now maps every eligible
 * chart hash to a course), but it's still just a label here - no per-course background art yet.
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
    // One font (Nunito) for both numbers and labels - matching the frontend site's own stat/score
    // convention (PlayCard, RecentPlaysPanel) - weight/size/opacity carry the number-vs-label
    // hierarchy instead of a font swap. Not Miso: Miso isn't actually on Google Fonts
    // (fonts.googleapis.com/css2?family=Miso 404s) and this repo only has its Light instance
    // self-hosted, so anything rendered in it at small sizes reads as thin/hard-to-read no matter
    // what fontWeight is declared - there's no bold Miso glyph to fall back to.
    // PermanentMarker is only for the course name, mirroring scripts/golf-satori-poc.ts's
    // buildCardHeader - a distinct handwritten font for branding, separate from body text.
    const [nunitoRegular, nunitoBold, permanentMarker] = [
      readFileSync(path.join(ASSETS_DIR, 'fonts', 'nunito-400.woff')),
      readFileSync(path.join(ASSETS_DIR, 'fonts', 'nunito-800.woff')),
      readFileSync(path.join(ASSETS_DIR, 'fonts', 'PermanentMarker-Regular.ttf')),
    ];
    fonts = [
      { name: 'Nunito', data: nunitoRegular, weight: 400, style: 'normal' },
      { name: 'Nunito', data: nunitoBold, weight: 700, style: 'normal' },
      { name: 'PermanentMarker', data: permanentMarker, weight: 400, style: 'normal' },
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

// Real golf terms mapped from a whole-number strokes-vs-par - same table as
// scripts/golf-satori-poc.ts / scripts/golf-session-review-web/src/golf.ts's golfTermFor,
// duplicated here rather than imported since this file already reimplements the rest of the
// scoring/color logic locally (see strokeColorHex above). `par` is real per-chart data assigned via
// scripts/assign-golf-pars.ts (see event-result-images.ts's GOLF_CHARTS) - not fabricated.
function golfTermFor(strokesVsPar: number): string {
  switch (strokesVsPar) {
    case -3:
      return 'Albatross';
    case -2:
      return 'Eagle';
    case -1:
      return 'Birdie';
    case 0:
      return 'Par';
    case 1:
      return 'Bogey';
    case 2:
      return 'Double Bogey';
    case 3:
      return 'Triple Bogey';
    default:
      return strokesVsPar < 0 ? `${Math.abs(strokesVsPar)} Under Par` : `${strokesVsPar} Over Par`;
  }
}

function fmtVsPar(strokesVsPar: number): { text: string; color: string } {
  const term = golfTermFor(strokesVsPar);
  if (strokesVsPar === 0) return { text: `E · ${term}`, color: 'rgba(255,255,255,0.85)' };
  const sign = strokesVsPar > 0 ? '+' : '';
  return { text: `${sign}${strokesVsPar} · ${term}`, color: strokesVsPar < 0 ? STROKE_GOOD : STROKE_BAD };
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

// Multi-octave radial noise - a small randomized Fourier series - rather than a hand-composed
// "ellipse x one harmonic x per-point jitter" model. That older approach always read as a stretched,
// pinched circle, because it fundamentally only had two independent shape frequencies (the ellipse
// itself is a k=1 asymmetry, the "lobe" a k=2 one) plus unstructured per-point noise that the
// Catmull-Rom spline mostly smoothed back out. Here, each octave k=1..OCTAVES is an independent
// cosine at its own random amplitude/phase; k=1 alone already produces the elongation the old
// ellipse formula did (a single-lobe asymmetry *is* elongation), k=2 a waist/lobe, and k=3+ layer in
// genuinely organic, non-repeating fine irregularity along the edge - the standard technique for
// procedural blob/island silhouettes. Amplitude decays per octave (persistence, same idea as Perlin
// noise's octave falloff) so low frequencies set the overall silhouette and high frequencies only
// add detail, never dominate. All of it comes from the same chart-hash-seeded rng, so the whole
// shape is deterministic per chart.
// Every chart previously produced the same "family" of shape (isotropic noise around a circle) -
// visually distinct per chart, but all reading as one blobby archetype. A small hand-picked set of
// variants - chosen deterministically per chart hash, same as everything else here - gives real
// layout diversity (skinny/wide, round, sprawling) on top of the per-chart noise, the way real
// greens vary in silhouette, not just in edge detail.
interface GreenVariant {
  name: string;
  aspectX: number;
  aspectY: number;
  octaves: number;
  persistence: number;
  amplitude: number;
}

const GREEN_VARIANTS: GreenVariant[] = [
  { name: 'round', aspectX: 1, aspectY: 1, octaves: 4, persistence: 0.42, amplitude: 0.28 },
  { name: 'wide', aspectX: 1.35, aspectY: 0.8, octaves: 4, persistence: 0.42, amplitude: 0.26 },
  { name: 'tall', aspectX: 0.8, aspectY: 1.35, octaves: 4, persistence: 0.42, amplitude: 0.26 },
  { name: 'compact', aspectX: 0.82, aspectY: 0.82, octaves: 3, persistence: 0.4, amplitude: 0.16 },
  { name: 'sprawling', aspectX: 1.15, aspectY: 1.05, octaves: 5, persistence: 0.4, amplitude: 0.3 },
];

function pickGreenVariant(rng: () => number): GreenVariant {
  return GREEN_VARIANTS[Math.floor(rng() * GREEN_VARIANTS.length) % GREEN_VARIANTS.length];
}

function generateGreenControlPoints(rng: () => number, count: number, baseRadius: number, variant: GreenVariant): GreenControlPoint[] {
  const { aspectX, aspectY, octaves, persistence, amplitude: startAmplitude } = variant;
  let amplitude = startAmplitude;
  const harmonics: { k: number; amplitude: number; phase: number }[] = [];
  for (let k = 1; k <= octaves; k++) {
    harmonics.push({ k, amplitude: amplitude * (0.7 + rng() * 0.6), phase: rng() * Math.PI * 2 });
    amplitude *= persistence;
  }

  // Both bounds are safety clamps, not stylistic choices - persistence/amplitude above are tuned so
  // these rarely bind, but random phases could in principle align at one angle across all octaves at
  // once. The green outline itself (not just the dots plotted against it) needs to stay inside its
  // container or it visibly overlaps the card content around it, so the multiplier's ceiling/floor
  // are derived from the variant's own aspect ratio - a "wide" variant's ellipse alone already
  // reaches 1.35x on its long axis, so its noise multiplier gets a correspondingly tighter ceiling
  // than "round"'s, keeping every variant's overall radius inside the same [0.45, 1.3] envelope.
  const maxAspect = Math.max(aspectX, aspectY);
  const minAspect = Math.min(aspectX, aspectY);
  const multiplierMax = 1.3 / maxAspect;
  const multiplierMin = 0.45 / minAspect;

  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    // Polar-ellipse base radius (aspectX along the horizontal axis, aspectY along the vertical) -
    // this is what actually produces "skinnier vertical"/"skinnier horizontal"/"more circular", on
    // top of which the per-octave noise still adds organic irregularity.
    const ellipseFactor = (aspectX * aspectY) / Math.sqrt((aspectY * Math.cos(angle)) ** 2 + (aspectX * Math.sin(angle)) ** 2);
    let multiplier = 1;
    for (const h of harmonics) multiplier += h.amplitude * Math.cos(h.k * angle + h.phase);
    multiplier = Math.min(Math.max(multiplier, multiplierMin), multiplierMax);
    return { angle, radius: baseRadius * ellipseFactor * multiplier };
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
  // 24 control points to properly resolve up to 5-octave noise below Nyquist - fewer points would
  // alias the higher octaves into jagged/spiky edges instead of smooth organic curves.
  const variant = pickGreenVariant(rng);
  const controlPoints = generateGreenControlPoints(rng, 24, R * 0.5, variant);
  const OVERSHOOT = 1.3;

  const jitter01 = (n: number) => {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const greenSvgUri = buildGreenSvgDataUri(controlPoints, diameter);

  // Real charts run 800-2000+ notes, not the ~300 this was originally tuned against. A literal
  // one-dot-per-note plot at that count either overwhelms the render (thousands of absolutely
  // positioned elements) or, if dots are also faded down, disappears almost entirely: aces cluster
  // near the pin at a near-zero radius but still spread across the *full circle* in angle (angle is
  // chronological position, not per-hit), so at high counts they form a thin ring around the cup
  // rather than one overlapping stack - there isn't enough overlap for opacity-blending to build
  // visible density, so a first pass that faded AND shrunk dots together just made the chart go
  // blank. Size is what keeps a high-count chart readable; opacity only needs a light touch as a
  // ceiling on the rare heavy-overlap spot, not as a primary density signal.
  const DENSITY_REF = 300;
  const dotSizeScale = Math.max(0.5, Math.min(1, DENSITY_REF / notes.length));
  const dotOpacity = Math.max(0.8, Math.min(1, (DENSITY_REF * 2) / notes.length));
  // Caps the actual element count for pathologically long charts, by plotting every Nth note by
  // original chronological index (not truncating to the first N) so the sampled shape/timing
  // distribution still represents the full play. Set above the 800-2000 range this was tuned for -
  // sampling isn't needed there, only as a safety valve for outliers.
  const MAX_PLOTTED_DOTS = 2500;
  const stride = Math.max(1, Math.ceil(notes.length / MAX_PLOTTED_DOTS));

  const positions: { cx: number; cy: number; strokes: number }[] = [];
  for (let i = 0; i < notes.length; i += stride) {
    const note = notes[i];
    const angleJitter = (jitter01(i * 2 + 1) - 0.5) * ((Math.PI * 2) / notes.length) * 6;
    const radiusJitter = 1 + (jitter01(i * 2 + 2) - 0.5) * 0.35;
    const angle = -Math.PI / 2 + (i / notes.length) * Math.PI * 2 + angleJitter;
    const localBoundary = greenRadiusAtAngle(angle, controlPoints);
    const t = Math.sqrt(Math.min(note.strokes, 200) / 200);
    const radius = Math.min(localBoundary * Math.max(t, 0.035) * OVERSHOOT * radiusJitter, R * 0.95);
    positions.push({ cx: R + radius * Math.cos(angle), cy: R + radius * Math.sin(angle), strokes: note.strokes });
  }

  const dots = positions.map(({ cx, cy, strokes }) => {
    const size = s((3 + (Math.min(strokes, 200) / 200) * 4) * dotSizeScale);
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
        opacity: dotOpacity,
      },
    });
  });

  // Capped separately from the dot count above (MAX_ACE_RINGS, not MAX_PLOTTED_DOTS) - hundreds of
  // individual ring outlines don't blend via opacity the way overlapping filled dots do, they'd just
  // read as scribble, so only a representative sample gets an explicit ring.
  const MAX_ACE_RINGS = 40;
  const acePositions = positions.filter((p) => p.strokes === 0);
  const aceRingStride = Math.max(1, Math.ceil(acePositions.length / MAX_ACE_RINGS));
  const aceRingSize = s(11 * Math.max(0.6, dotSizeScale));
  const aceRings = acePositions
    .filter((_, i) => i % aceRingStride === 0)
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
          opacity: Math.max(0.4, dotOpacity),
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
  /** From event-result-images.ts's GOLF_CHARTS - display name for the pack this chart belongs to
   * ("Alpha Testing" for the original pre-beta hashes, the real pack's name for Beta Hills/Pines). */
  courseName: string;
  totalStrokes: number;
  noteCount: number;
  previousBestStrokes: number | null;
  /** Real assigned par (scripts/assign-golf-pars.ts) - null for charts that don't have one yet
   * (currently the "Alpha Testing" set), in which case the card falls back to showing strokes alone. */
  par: number | null;
  aceCount: number;
  obCount: number;
  /** Per-note strokes, in chronological order - drives the dispersion chart. */
  noteStrokes: number[];
}

function buildCard(data: GolfResultImageData, images: { headerLogoDataUri: string; acLogoDataUri: string; patternDataUri: string }) {
  const delta = data.previousBestStrokes !== null ? fmtStrokeDelta(data.totalStrokes - data.previousBestStrokes) : undefined;
  const strokesVsPar = data.par !== null ? Math.round(data.totalStrokes / 1000) - data.par : null;
  const vsPar = strokesVsPar !== null ? fmtVsPar(strokesVsPar) : undefined;
  const VALUE_SLOT_HEIGHT = s(56); // matches the strokes number's own fontSize - see its usage below
  const DISPERSION_DIAMETER = s(410);

  // One font (Nunito) for both numbers and labels - weight/size/opacity carry the hierarchy instead
  // of a font swap. lineHeight: 1 on both lines strips each font's built-in leading (the default
  // line-height at fontSize 64 was pushing the label much further from its number than the
  // fontSize gap alone would suggest) so the explicit marginTop below is the *only* space between
  // a number and its own label.
  const miniStat = (label: string, value: number, color: string) =>
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
      h('div', { style: { display: 'flex', fontFamily: 'Nunito', fontSize: s(34), fontWeight: 700, lineHeight: 1, color } }, `${value}`),
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontFamily: 'Nunito',
            fontSize: s(11),
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: s(1.5),
            marginTop: s(4),
            color: 'rgba(255,255,255,0.6)',
          },
        },
        label,
      ),
    );

  const statLabel = (text: string) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          fontFamily: 'Nunito',
          fontSize: s(11),
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: s(1.5),
          marginTop: s(6),
          color: 'rgba(255,255,255,0.6)',
        },
      },
      text,
    );

  // Ported from scripts/golf-satori-poc.ts's approved design review: strokes and par presented as
  // visual equals side by side, with the term ("Birdie"/"Bogey"/etc.) vertically centered against
  // the strokes number via a shared fixed-height VALUE_SLOT_HEIGHT box on both sides - that's what
  // keeps "STROKES"/"PAR N" landing on the same line below regardless of which value is taller.
  // "Double Bogey"/"Triple Bogey" (and the fallback "N Under/Over Par" terms) wrap onto two lines
  // (split on the first space) instead of forcing truncatedLine's ellipsis.
  const TERM_FONT_SIZE = s(26);
  const TERM_WRAP_FONT_SIZE = s(19);
  const TERM_WRAP_LINE_GAP = s(2);
  const valueSlot = (content: Child) =>
    h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: VALUE_SLOT_HEIGHT } }, content);
  const parTermContent = (term: string, color: string) => {
    const spaceIndex = term.indexOf(' ');
    if (spaceIndex === -1) {
      return truncatedLine(term, s(140), { fontFamily: 'Nunito', fontSize: TERM_FONT_SIZE, fontWeight: 700, lineHeight: 1, color });
    }
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
      truncatedLine(term.slice(0, spaceIndex), s(140), { fontFamily: 'Nunito', fontSize: TERM_WRAP_FONT_SIZE, fontWeight: 700, lineHeight: 1, color }),
      truncatedLine(term.slice(spaceIndex + 1), s(140), {
        fontFamily: 'Nunito',
        fontSize: TERM_WRAP_FONT_SIZE,
        fontWeight: 700,
        lineHeight: 1,
        color,
        marginTop: TERM_WRAP_LINE_GAP,
      }),
    );
  };

  const strokesNumber = valueSlot(
    h(
      'div',
      { style: { display: 'flex', fontFamily: 'Nunito', fontSize: s(56), fontWeight: 700, lineHeight: 1, color: '#ffffff' } },
      fmtStrokes(data.totalStrokes),
    ),
  );

  // Charts without an assigned par (currently the "Alpha Testing" set) fall back to the original
  // single-centered-column layout - no divider, no par column, nothing invented.
  const strokesAndPar =
    data.par !== null && vsPar
      ? h(
          'div',
          { style: { display: 'flex', alignItems: 'flex-start', gap: s(28) } },
          h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } }, strokesNumber, statLabel('STROKES')),
          h('div', { style: { display: 'flex', width: s(1.5), height: VALUE_SLOT_HEIGHT, backgroundColor: 'rgba(255,255,255,0.15)' } }),
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
            valueSlot(parTermContent(golfTermFor(strokesVsPar as number), vsPar.color)),
            statLabel(`PAR ${data.par}`),
          ),
        )
      : h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } }, strokesNumber, statLabel('STROKES'));

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
      truncatedLine(data.courseName, CARD_WIDTH - s(40), { fontFamily: 'PermanentMarker', fontSize: s(20), color: STROKE_GOOD, marginTop: s(4) }),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: s(8) } },
        truncatedLine(data.chartTitle, CARD_WIDTH - s(40), { fontSize: s(18), fontWeight: 700, color: 'rgba(255,255,255,0.9)' }),
        truncatedLine(data.chartArtist, CARD_WIDTH - s(40), { fontSize: s(15), fontWeight: 700, color: 'rgba(255,255,255,0.65)', marginTop: s(1) }),
      ),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: s(14) } },
      strokesAndPar,
      // No previous best (first play on this chart, or the read-api call failed/timed out) - the
      // card still renders, just without this line, rather than failing or showing a fake delta.
      delta &&
        h(
          'div',
          { style: { display: 'flex', fontSize: s(14), fontWeight: 600, lineHeight: 1, color: delta.color, marginTop: s(12) } },
          `${delta.text} vs. previous best`,
        ),
      h(
        'div',
        { style: { display: 'flex', gap: s(20), marginTop: s(14) } },
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
