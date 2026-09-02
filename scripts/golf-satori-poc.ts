#!/usr/bin/env tsx
/**
 * Local visual POC for the golf-event result card, rendered with satori + resvg (same pipeline as
 * scripts/satori-poc.ts, the pack-leaderboard reference this is cloned from). Entirely local - no
 * AWS, no DB, mock data only. See docs/plans/golf-event-result-images.md for the full design.
 *
 * Scope for this pass (per direction): ONE card - this play's stroke total, the delta vs. previous
 * best, and a novel per-note visualization. A scatterplot of offset-vs-time would just repeat what
 * the player already saw flash by during play, so instead: a "pin-proximity dispersion chart" -
 * the same shape real golf shot-dispersion charts use. Each tap note becomes a dot on a circular
 * green: angle = the note's chronological position in the chart (one full lap, clockwise from 12
 * o'clock = start to finish), radius = how far that hit landed from the pin (an ace lands in the
 * cup; a miss lands off the green in the rough). The whole play becomes one recognizable shape
 * instead of a time-series.
 *
 * Branding: the "In The Golf" wordmark (scripts/assets/ITGolf_Logo-ArrowLeft_Large.png) as the
 * header, the Arrow Cloud mark (scripts/assets/ac-logo.png) as a small corner mark, and the
 * tileable course-map pattern (scripts/assets/arrowpattern.png) as a low-opacity background wash.
 *
 * The green itself is a deterministically-random organic blob seeded from the chart hash (not from
 * the play data) - the same chart always renders the same green shape, distinct per chart, with the
 * pin dead center of the image. See buildDispersionChart / generateGreenControlPoints below.
 *
 * Usage:
 *   npx tsx scripts/golf-satori-poc.ts [--runs <n>] [--seed <n>] [--chart-hash <hash>]
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const SCALE = 2;
const s = (n: number) => n * SCALE;
const CARD_WIDTH = s(480);
const CARD_HEIGHT = s(600);

const STROKE_GOOD = '#36d399';
const STROKE_BAD = '#f87272';

// Fixed for this POC - all three mock images belong to the same course.
const COURSE_NAME = 'Beta Pines';

// --- Golf stroke calculation (mirrors the verified formula in docs/plans/golf-event-result-images.md
// / the future api/src/utils/scoring/golf.ts) - used here so the hero total and the dispersion chart
// are derived from the same mock per-note data, not two independently-invented numbers. ---
function calcStrokes(offsetMs: number | 'Miss'): number {
  if (offsetMs === 'Miss') return 200;
  const ms = Math.abs(offsetMs);
  if (ms <= 4) return 0;
  if (ms > 103.5) return 200;
  return Math.floor(ms) - 4;
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

// Deterministic PRNG (mulberry32) so re-running the script without --seed reproduces the same card.
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

interface MockNote {
  offsetMs: number | 'Miss';
  strokes: number;
}

// Five accuracy profiles spanning "basically perfect" to "rough round" - cumulative roll
// probabilities (missP, then +looseP, then +mediumP, else tight) plus a magnitude range per tier.
// PROFILES.good matches the original single mock run this script started with.
interface SkillProfile {
  name: string;
  noteCount: number;
  missP: number;
  looseP: number;
  mediumP: number;
  tightRange: number;
  mediumRange: number;
  looseRange: number;
}

const PROFILES: SkillProfile[] = [
  // Every hit genuinely <10ms, on a longer ~400-note chart - a real "flawless" clear, not just a
  // shorter chart with a couple of loose hits omitted.
  { name: 'flawless', noteCount: 400, missP: 0, looseP: 0, mediumP: 0, tightRange: 9, mediumRange: 20, looseRange: 50 },
  { name: 'excellent', noteCount: 180, missP: 0.002, looseP: 0.02, mediumP: 0.08, tightRange: 8, mediumRange: 30, looseRange: 70 },
  { name: 'good', noteCount: 180, missP: 0.02, looseP: 0.08, mediumP: 0.2, tightRange: 10, mediumRange: 35, looseRange: 90 },
  { name: 'rough', noteCount: 180, missP: 0.05, looseP: 0.15, mediumP: 0.25, tightRange: 15, mediumRange: 45, looseRange: 100 },
  { name: 'poor', noteCount: 180, missP: 0.12, looseP: 0.22, mediumP: 0.25, tightRange: 20, mediumRange: 60, looseRange: 103.5 },
];

function generateMockNotes(rng: () => number, count: number, profile: SkillProfile): MockNote[] {
  const notes: MockNote[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rng();
    let offsetMs: number | 'Miss';
    if (roll < profile.missP) {
      offsetMs = 'Miss';
    } else if (roll < profile.missP + profile.looseP) {
      offsetMs = (rng() - 0.5) * 2 * profile.looseRange;
    } else if (roll < profile.missP + profile.looseP + profile.mediumP) {
      offsetMs = (rng() - 0.5) * 2 * profile.mediumRange;
    } else {
      offsetMs = (rng() - 0.5) * 2 * profile.tightRange;
    }
    notes.push({ offsetMs, strokes: calcStrokes(offsetMs) });
  }
  return notes;
}

function sumStrokes(notes: MockNote[]): number {
  return notes.reduce((total, n) => total + n.strokes, 0);
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

// FNV-1a - deterministic string -> 32-bit seed, so the green shape below is derived from the chart
// hash (same chart always renders the same green) rather than from anything play-specific.
function hashStringToSeed(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// --- Tiny hyperscript helper - no JSX needed for a standalone script. ---
type Node = { type: string; props: Record<string, unknown> };
type Child = Node | string | null | undefined | false;
function h(type: string, props: Record<string, unknown> = {}, ...children: (Child | Child[])[]): Node {
  const flatChildren = children.flat().filter((c): c is Node | string => c !== null && c !== undefined && c !== false);
  return { type, props: { ...props, children: flatChildren.length === 1 ? flatChildren[0] : flatChildren } };
}

// --- The pin-proximity dispersion chart ---
// The green is a deterministically-random organic blob, seeded from the chart hash - the same
// chart always renders the same green shape, but every chart looks like a distinct real green
// rather than a generic circle. Each tap note is a dot at (angle = chronological position in the
// chart, radius = distance from pin, scaled against the green's *local* edge in that direction so
// a bad miss visibly lands in the rough no matter which way the blob is wobbling that way).
// Aggregate mine/hold/roll penalties (flat +200 each, per the verified scoring formula) have no
// per-note identity in the real submission payload, so they contribute to the hero total but
// intentionally have no dot here - the chart only plots what individually exists in the data.
interface GreenControlPoint {
  angle: number;
  radius: number;
}

// Independent per-point noise alone tends to smooth back out into "a wobbly circle" once the
// Catmull-Rom spline runs through it - real greens read as irregular because they're elongated and
// often lobed, not just bumpy. So the radius at each angle is built from three layers: an ellipse
// (random aspect ratio + rotation, breaking circular symmetry at the largest scale), a second
// harmonic (an occasional waist/lobe, at a random phase), and per-point jitter (the fine edge
// irregularity). All three are drawn from the same chart-hash-seeded rng, in this order, so the
// whole shape - not just the noise - is deterministic per chart.
function generateGreenControlPoints(rng: () => number, count: number, baseRadius: number, wobbleFrac: number): GreenControlPoint[] {
  const aspect = 0.55 + rng() * 0.3; // 0.55-0.85: minor/major axis ratio - lower = more elongated
  const rotation = rng() * Math.PI * 2;
  const lobeAmp = 0.08 + rng() * 0.1; // subtle second-harmonic waist/lobe
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

// Control points are evenly spaced in angle, so the local boundary is just a linear interpolation
// between the two nearest points - a cheap approximation of the smooth spline drawn below, close
// enough to decide "is this dot inside the green or out in the rough".
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

// Catmull-Rom through the control points, converted to a closed cubic-bezier SVG path - smooths
// the evenly-spaced-but-randomized points into an organic, rounded green outline (the standard
// technique for procedural blob/island shapes; guaranteed non-self-intersecting at this wobble).
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

function buildDispersionChart(notes: MockNote[], diameter: number, chartHash: string) {
  const R = diameter / 2;
  const rng = mulberry32(hashStringToSeed(chartHash));
  // baseRadius is deliberately conservative (0.38R, not 0.55R) - the ellipse/lobe factors in
  // generateGreenControlPoints can multiply a control point's radius well past 1x baseRadius at its
  // widest, and this still needs to leave room for OVERSHOOT dots beyond it without touching the
  // container edge. The Math.min clamp below is the actual guarantee; this is just tuned to rarely
  // need it.
  const controlPoints = generateGreenControlPoints(rng, 10, R * 0.5, 0.15);
  const OVERSHOOT = 1.3;

  // Angle and radius are otherwise fully determined by (chronological index, strokes) - fine on
  // their own, but a run of consecutive misses (same strokes, adjacent angles) would otherwise
  // stack into an unnatural straight line at the same clamped radius. A cheap deterministic hash
  // per dot index (not the notes rng - this must stay stable regardless of note count/order
  // upstream) nudges each dot's angle/radius slightly so runs of similar hits spread into a
  // natural-looking cluster instead of a row of pearls.
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
    // t=0 (an ace) would otherwise put every ace at the exact same point (radius 0 regardless of
    // jitter, since 0 * anything = 0) - a small floor lets aces spread into a visible little cluster
    // right around the pin instead of stacking into one indistinguishable point.
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

  // Aces (strokes === 0) get a highlight ring so the "perfect hits" cluster is easy to pick out from
  // the general green/yellow/orange spread rather than blending in as just another small green dot.
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
    // Cup + flag, dead center - the pin is always the exact center of the image, regardless of how
    // the green's outline wobbles around it.
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
      style: {
        display: 'flex',
        position: 'absolute',
        width: s(11),
        height: s(7),
        left: R + s(2),
        top: R - FLAG_HEIGHT,
        backgroundColor: STROKE_BAD,
      },
    }),
  );
}

// Shared by all three card types (result, hole leaderboard, course leaderboard): the dark backing,
// low-opacity pattern wash, and small corner AC mark. Header logo + subtitle are passed in per-card
// since the subtitle content differs (chart info vs. course info).
const AC_MARK_SIZE = s(34);
// Kept clear of AC_MARK_SIZE's top-right corner spot - the logo is centered on the full card width,
// so its right edge (CARD_WIDTH/2 + width/2) must stay short of where the corner mark sits.
const HEADER_LOGO_WIDTH = s(300);
const HEADER_LOGO_HEIGHT = HEADER_LOGO_WIDTH * (199 / 1346); // ITGolf_Logo-ArrowLeft_Large.png's native aspect ratio (trimmed to its visible glyph bbox)

function buildCardShell(patternDataUri: string, acLogoDataUri: string, ...children: Child[]) {
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
      src: patternDataUri,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      style: { position: 'absolute', top: 0, left: 0, opacity: 0.1, objectFit: 'cover' },
    }),
    h('img', {
      src: acLogoDataUri,
      width: AC_MARK_SIZE,
      height: AC_MARK_SIZE,
      style: { position: 'absolute', top: s(16), right: s(16), opacity: 0.9 },
    }),
    ...children,
  );
}

function buildCardHeader(logoDataUri: string, subtitle: Child) {
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: s(20), paddingBottom: 0 } },
    h('img', { src: logoDataUri, width: HEADER_LOGO_WIDTH, height: HEADER_LOGO_HEIGHT, style: { display: 'flex' } }),
    // Course (pack) name, in the fun handwritten font - distinct from the hole (chart) info below it,
    // which stays in the normal body font (bold) since it's regular informational text, not branding.
    h('div', { style: { display: 'flex', fontFamily: 'PermanentMarker', fontSize: s(28), color: STROKE_GOOD, marginTop: s(10) } }, COURSE_NAME),
    subtitle,
  );
}

function buildGolfCard(opts: {
  chartTitle: string;
  chartArtist: string;
  chartHash: string;
  totalStrokes: number;
  previousBestStrokes: number;
  notes: MockNote[];
  logoDataUri: string;
  acLogoDataUri: string;
  patternDataUri: string;
}) {
  const { chartTitle, chartArtist, chartHash, totalStrokes, previousBestStrokes, notes, logoDataUri, acLogoDataUri, patternDataUri } = opts;
  const delta = fmtStrokeDelta(totalStrokes - previousBestStrokes);
  const DISPERSION_DIAMETER = s(410);
  const aceCount = notes.filter((n) => n.strokes === 0).length;
  const obCount = notes.filter((n) => n.strokes === 200).length;

  // Number-on-top, label-beneath - same stacked convention as STROKES below, now shared by every
  // mini stat rather than STROKES being a one-off.
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

  return buildCardShell(
    patternDataUri,
    acLogoDataUri,
    buildCardHeader(
      logoDataUri,
      h(
        'div',
        { style: { display: 'flex', fontSize: s(18), fontWeight: 700, color: 'rgba(255,255,255,0.85)', gap: s(8), marginTop: s(8) } },
        h('span', {}, chartTitle),
        h('span', {}, '·'),
        h('span', {}, chartArtist),
      ),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: s(10) } },
      h('div', { style: { display: 'flex', fontFamily: 'Miso', fontSize: s(64), fontWeight: 700, color: '#ffffff' } }, fmtStrokes(totalStrokes)),
      h(
        'div',
        { style: { display: 'flex', fontFamily: 'Miso', fontSize: s(16), fontWeight: 700, letterSpacing: s(2), color: 'rgba(255,255,255,0.55)' } },
        'STROKES',
      ),
      h('div', { style: { display: 'flex', fontSize: s(20), fontWeight: 700, color: delta.color, marginTop: s(6) } }, `${delta.text} vs. previous best`),
      h('div', { style: { display: 'flex', gap: s(20), marginTop: s(10) } }, miniStat('ACES', aceCount, STROKE_GOOD), miniStat('OB', obCount, STROKE_BAD)),
    ),
    h(
      'div',
      { style: { display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' } },
      buildDispersionChart(notes, DISPERSION_DIAMETER, chartHash),
    ),
  );
}

// --- Image 2/3: hole (chart) and course (pack) leaderboards ---
// Golf terminology mapped onto the existing concepts: a "hole" is a single chart, a "course" is a
// pack of holes - the course leaderboard ranks players by their summed strokes across every hole,
// same relationship as the pack-leaderboard "chart points" vs. "pack total" split. Lower total
// strokes = better rank, same top+self+neighbors+rivals+fill-to-7 selection as the pack-leaderboard
// reference (scripts/satori-poc.ts's selectNearbyRankings) - copied verbatim, the algorithm itself
// doesn't care whether higher or lower is "better", only the caller's rank field does.
interface MockRanking {
  rank: number;
  alias: string;
  totalStrokes: number;
  isSelf: boolean;
  isRival: boolean;
}

const RANKING_TOP_N = 2;
const RANKING_TARGET_SIZE = 7;
const RIVAL_COLOR = STROKE_BAD;
const SELF_COLOR = '#FFD166';

function selectNearbyRankings(rankings: MockRanking[]): MockRanking[] {
  const selfEntry = rankings.find((r) => r.isSelf);
  const top = rankings.filter((r) => r.rank <= RANKING_TOP_N);
  const neighbors = selfEntry ? rankings.filter((r) => r.rank === selfEntry.rank - 1 || r.rank === selfEntry.rank + 1) : [];

  const rivalsByRank = rankings.filter((r) => r.isRival).sort((a, b) => a.rank - b.rank);
  const topRival = rivalsByRank[0];
  let nearestRival: MockRanking | undefined;
  if (selfEntry && rivalsByRank.length) {
    const byDistance = [...rivalsByRank].sort((a, b) => Math.abs(a.rank - selfEntry.rank) - Math.abs(b.rank - selfEntry.rank));
    nearestRival = byDistance[0] === topRival && byDistance.length > 1 ? byDistance[1] : byDistance[0];
  }

  const byAlias = new Map<string, MockRanking>();
  const add = (r?: MockRanking) => {
    if (r && !byAlias.has(r.alias)) byAlias.set(r.alias, r);
  };
  top.forEach(add);
  add(selfEntry);
  neighbors.forEach(add);
  add(topRival);
  add(nearestRival);

  if (byAlias.size < RANKING_TARGET_SIZE && selfEntry) {
    const remaining = rankings.filter((r) => !byAlias.has(r.alias)).sort((a, b) => Math.abs(a.rank - selfEntry.rank) - Math.abs(b.rank - selfEntry.rank));
    for (const r of remaining) {
      if (byAlias.size >= RANKING_TARGET_SIZE) break;
      byAlias.set(r.alias, r);
    }
  }

  return Array.from(byAlias.values()).sort((a, b) => a.rank - b.rank);
}

const MOCK_NAME_POOL = [
  'Nova',
  'Kirei',
  'Jynx',
  'Prism',
  'Solace',
  'Ducky',
  'Rune',
  'Echo',
  'Vex',
  'Halcyon',
  'Frostbyte',
  'Comet',
  'Nyx',
  'Zephyr',
  'Quill',
  'Orin',
  'Sable',
  'Lumen',
  'Marrow',
  'Kestrel',
  'Thistle',
  'Onyx',
  'Wisp',
  'Talon',
  'Ashen',
  'Brine',
  'Cypher',
  'Drift',
  'Ember',
  'Flux',
  'Grimm',
  'Hollow',
  'Iris',
  'Jolt',
  'Kite',
  'Lace',
  'Mote',
  'Null',
  'Opal',
  'Pyre',
  'Quartz',
  'Rift',
  'Static',
  'Torque',
  'Umbra',
  'Vane',
  'Wren',
  'Xeno',
  'Yara',
  'Zed',
  'Basalt',
  'Cinder',
  'Delta',
  'Eave',
  'Feral',
  'Glint',
  'Husk',
  'Ion',
  'Jade',
  'Karma',
  'Loom',
  'Mire',
  'Nix',
  'Ochre',
  'Petra',
];

function buildMockFullRankings(opts: { bestStrokes: number; worstStrokes: number; selfRank: number; rivalAliases: string[] }): MockRanking[] {
  const names = [...MOCK_NAME_POOL];
  names.splice(opts.selfRank - 1, 0, 'Wafles');
  return names.map((alias, i) => {
    const t = i / (names.length - 1);
    return {
      rank: i + 1,
      alias,
      totalStrokes: Math.round(opts.bestStrokes + t * (opts.worstStrokes - opts.bestStrokes)),
      isSelf: alias === 'Wafles',
      isRival: opts.rivalAliases.includes(alias),
    };
  });
}

function buildRankingsCard(opts: {
  subtitle: Child;
  sectionLabel: string;
  rankings: MockRanking[];
  totalParticipants: number;
  logoDataUri: string;
  acLogoDataUri: string;
  patternDataUri: string;
}) {
  const { subtitle, sectionLabel, rankings, totalParticipants, logoDataUri, acLogoDataUri, patternDataUri } = opts;
  const selected = selectNearbyRankings(rankings);
  const rows = selected.map((r, i) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          padding: `${s(8)}px ${s(10)}px`,
          backgroundColor: r.isSelf ? 'rgba(255,255,255,0.07)' : 'transparent',
          borderBottom: i < selected.length - 1 ? `${s(1)}px solid rgba(255,255,255,0.07)` : 'none',
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            width: s(44),
            fontFamily: 'Miso',
            fontSize: s(22),
            fontWeight: 700,
            color: r.isSelf ? SELF_COLOR : 'rgba(255,255,255,0.5)',
          },
        },
        `${r.rank}`,
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            flex: 1,
            fontSize: s(21),
            fontWeight: r.isSelf || r.isRival ? 700 : 400,
            color: r.isSelf ? SELF_COLOR : r.isRival ? RIVAL_COLOR : '#ffffff',
          },
        },
        r.alias,
      ),
      h('div', { style: { display: 'flex', fontFamily: 'Miso', fontSize: s(21), fontWeight: 700 } }, fmtStrokes(r.totalStrokes)),
    ),
  );

  return buildCardShell(
    patternDataUri,
    acLogoDataUri,
    buildCardHeader(logoDataUri, subtitle),
    h(
      'div',
      {
        style: {
          display: 'flex',
          margin: `${s(14)}px ${s(20)}px ${s(4)}px`,
          paddingBottom: s(8),
          borderBottom: `${s(1)}px solid rgba(255,255,255,0.1)`,
        },
      },
      h('div', { style: { display: 'flex', fontFamily: 'Miso', fontSize: s(28), fontWeight: 700, color: STROKE_GOOD } }, sectionLabel),
    ),
    h('div', { style: { display: 'flex', flexDirection: 'column', padding: `0 ${s(20)}px` } }, ...rows),
    h(
      'div',
      { style: { display: 'flex', flex: 1, alignItems: 'flex-end', justifyContent: 'center', paddingBottom: s(12) } },
      h('div', { style: { display: 'flex', fontSize: s(15), color: 'rgba(255,255,255,0.4)' } }, `${totalParticipants} participants`),
    ),
  );
}

function parseArgs(argv: string[]) {
  const get = (flag: string, fallback: string) => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : fallback;
  };
  return {
    runs: parseInt(get('--runs', '1'), 10) || 1,
    seed: parseInt(get('--seed', '42'), 10) || 42,
    // Stands in for the real chart hash a submission would carry - the green shape is seeded from
    // this, not from --seed, since the green must stay fixed for a chart regardless of who's playing.
    chartHash: get('--chart-hash', 'a3f9c81d4e2b7f60c9d3e8a1f60b7c42'),
  };
}

async function main() {
  const { runs, seed, chartHash } = parseArgs(process.argv.slice(2));

  const bodyData = readFileSync(path.resolve('scripts/assets/fonts/nunito-400.woff'));
  const bodyBoldData = readFileSync(path.resolve('scripts/assets/fonts/nunito-800.woff'));
  const labelData = readFileSync(path.resolve('scripts/assets/fonts/miso-light.ttf'));
  const markerData = readFileSync(path.resolve('scripts/assets/fonts/PermanentMarker-Regular.ttf'));
  const fonts = [
    { name: 'Nunito', data: bodyData, weight: 400 as const, style: 'normal' as const },
    { name: 'Nunito', data: bodyBoldData, weight: 700 as const, style: 'normal' as const },
    { name: 'Miso', data: labelData, weight: 700 as const, style: 'normal' as const },
    { name: 'PermanentMarker', data: markerData, weight: 400 as const, style: 'normal' as const },
  ];

  const toDataUri = (p: string) => `data:image/png;base64,${readFileSync(path.resolve(p)).toString('base64')}`;
  const logoDataUri = toDataUri('scripts/assets/ITGolf_Logo-ArrowLeft_Large.png');
  const acLogoDataUri = toDataUri('scripts/assets/ac-logo.png');
  const patternDataUri = toDataUri('scripts/assets/arrowpattern.png');

  mkdirSync(path.resolve('scripts/output'), { recursive: true });
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const fmt = (ms: number) => `${ms.toFixed(1)}ms`;
  const allSatoriTimes: number[] = [];
  const allResvgTimes: number[] = [];

  const render = async (name: string, tree: Node) => {
    const satoriTimes: number[] = [];
    const resvgTimes: number[] = [];
    let pngBuffer = Buffer.alloc(0);
    for (let i = 0; i < runs; i++) {
      const satoriStart = performance.now();
      const svg = await satori(tree as never, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });
      satoriTimes.push(performance.now() - satoriStart);

      const resvgStart = performance.now();
      pngBuffer = Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } }).render().asPng());
      resvgTimes.push(performance.now() - resvgStart);
    }
    allSatoriTimes.push(...satoriTimes);
    allResvgTimes.push(...resvgTimes);
    const outPath = path.resolve(`scripts/output/${name}`);
    writeFileSync(outPath, pngBuffer);
    console.log(`${name.padEnd(32)} | satori ${fmt(avg(satoriTimes))} resvg ${fmt(avg(resvgTimes))}`);
  };

  // Image 1: this play's result card (score + delta + dispersion chart).
  const profile = PROFILES.find((p) => p.name === 'good')!;
  const rng = mulberry32(seed);
  const notes = generateMockNotes(rng, profile.noteCount, profile);
  const tapStrokes = sumStrokes(notes);
  const aggregatePenalty = 400;
  const totalStrokes = tapStrokes + aggregatePenalty;
  const prevRng = mulberry32(seed + 1);
  const previousBestStrokes = sumStrokes(generateMockNotes(prevRng, profile.noteCount, profile)) + aggregatePenalty;

  await render(
    'golf-poc-1-result.png',
    buildGolfCard({
      chartTitle: 'Fairway to Heaven',
      chartArtist: 'modus',
      chartHash,
      totalStrokes,
      previousBestStrokes,
      notes,
      logoDataUri,
      acLogoDataUri,
      patternDataUri,
    }),
  );

  // Image 2: hole (chart) leaderboard - who's best on this one chart.
  const holeRankings = buildMockFullRankings({ bestStrokes: 350, worstStrokes: 9200, selfRank: 4, rivalAliases: ['Nova', 'Kite'] });
  await render(
    'golf-poc-2-hole-leaderboard.png',
    buildRankingsCard({
      subtitle: h(
        'div',
        { style: { display: 'flex', fontSize: s(18), fontWeight: 700, color: 'rgba(255,255,255,0.85)', gap: s(8), marginTop: s(8) } },
        h('span', {}, 'Fairway to Heaven'),
        h('span', {}, '·'),
        h('span', {}, 'modus'),
      ),
      sectionLabel: 'Hole 4 Leaderboard',
      rankings: holeRankings,
      totalParticipants: holeRankings.length,
      logoDataUri,
      acLogoDataUri,
      patternDataUri,
    }),
  );

  // Image 3: course (pack) leaderboard - summed strokes across every hole in the course.
  const courseRankings = buildMockFullRankings({ bestStrokes: 3200, worstStrokes: 78000, selfRank: 7, rivalAliases: ['Nova', 'Solace'] });
  await render(
    'golf-poc-3-course-leaderboard.png',
    buildRankingsCard({
      // Course name itself now comes from the shared header (COURSE_NAME, in Permanent Marker) -
      // this subtitle line only needs the course-specific detail the header doesn't cover.
      subtitle: h('div', { style: { display: 'flex', fontSize: s(18), fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginTop: s(8) } }, '9 Holes'),
      sectionLabel: 'Course Leaderboard',
      rankings: courseRankings,
      totalParticipants: courseRankings.length,
      logoDataUri,
      acLogoDataUri,
      patternDataUri,
    }),
  );

  const totalAvg = avg(allSatoriTimes) + avg(allResvgTimes);
  console.log(`\ntotal (avg per image): ${fmt(totalAvg)}`);
  console.log(totalAvg < 500 ? '✅ well under the 500ms target' : '⚠️  at/over the 500ms target');
}

main().catch((err) => {
  console.error('golf-satori-poc failed:', err);
  process.exit(1);
});
