import { useMemo } from 'react';
import { mulberry32, hashStringToSeed } from '../lib/prng';

// A stripped-down port of the actual production dispersion chart algorithm
// (api/src/utils/golf-result-image.ts) - same organic-blob-green + per-note dot plot, and same idea
// of a small hand-picked set of green silhouettes (round/wide/tall/etc) chosen deterministically per
// seed, layered under per-chart noise - real greens vary in silhouette, not just edge detail. Here
// the seed comes from `greenSeed` (one per demo play, see data/dispersionDemoPlays.ts), so cycling
// between plays shows a genuinely different hole each time, not just different dots on the same one.

const STROKE_GOOD = '#36d399';
const STROKE_BAD = '#f87272';

// GolfScoring.lua's strokeColor: green at 0 strokes, red at 99+, sqrt curve so yellow shows up
// around +20 and red ramps in faster than a linear blend would.
function strokeColorHex(strokes: number): string {
  const t = Math.sqrt(Math.min(Math.max(strokes / 99, 0), 1));
  const r = Math.round((0.2 + 0.8 * t) * 255);
  const g = Math.round((1 - 0.85 * t) * 255);
  const b = Math.round(Math.max(0.2 - 0.05 * t, 0) * 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

interface GreenControlPoint {
  angle: number;
  radius: number;
}

// A trimmed version of the real renderer's GREEN_VARIANTS set - enough spread (round, wide, tall,
// sprawling) that 5 cycling demo plays don't all land on near-identical silhouettes.
interface GreenVariant {
  aspectX: number;
  aspectY: number;
  octaves: number;
  persistence: number;
  amplitude: number;
}

const GREEN_VARIANTS: GreenVariant[] = [
  { aspectX: 1, aspectY: 1, octaves: 4, persistence: 0.42, amplitude: 0.28 },
  { aspectX: 1.35, aspectY: 0.8, octaves: 4, persistence: 0.42, amplitude: 0.26 },
  { aspectX: 0.8, aspectY: 1.35, octaves: 4, persistence: 0.42, amplitude: 0.26 },
  { aspectX: 0.82, aspectY: 0.82, octaves: 3, persistence: 0.4, amplitude: 0.16 },
  { aspectX: 1.15, aspectY: 1.05, octaves: 5, persistence: 0.4, amplitude: 0.3 },
];

function generateGreenControlPoints(rng: () => number, count: number, baseRadius: number, variant: GreenVariant): GreenControlPoint[] {
  const { aspectX, aspectY, octaves, persistence, amplitude: startAmplitude } = variant;
  let amplitude = startAmplitude;
  const harmonics: { k: number; amplitude: number; phase: number }[] = [];
  for (let k = 1; k <= octaves; k++) {
    harmonics.push({ k, amplitude: amplitude * (0.7 + rng() * 0.6), phase: rng() * Math.PI * 2 });
    amplitude *= persistence;
  }

  const maxAspect = Math.max(aspectX, aspectY);
  const minAspect = Math.min(aspectX, aspectY);
  const multiplierMax = 1.3 / maxAspect;
  const multiplierMin = 0.45 / minAspect;

  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
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

const OVERSHOOT = 1.3;
// Tuned for this demo's note-count range (150-700), not the real chart's (800-2000+) - keeps dots a
// readable size at the low end and still legible, if smaller, at the high end.
const DENSITY_REF = 250;

export default function DispersionChart({
  noteStrokes,
  greenSeed,
  greenVariant,
  size = 380,
}: {
  noteStrokes: number[];
  greenSeed: string;
  greenVariant: number;
  size?: number;
}) {
  const R = size / 2;

  const controlPoints = useMemo(() => {
    const rng = mulberry32(hashStringToSeed(greenSeed));
    const variant = GREEN_VARIANTS[((greenVariant % GREEN_VARIANTS.length) + GREEN_VARIANTS.length) % GREEN_VARIANTS.length];
    return generateGreenControlPoints(rng, 24, R * 0.5, variant);
  }, [R, greenSeed, greenVariant]);

  const { dots, aceRings } = useMemo(() => {
    const dotSizeScale = Math.max(0.5, Math.min(1, DENSITY_REF / noteStrokes.length));
    const dotOpacity = Math.max(0.75, Math.min(1, (DENSITY_REF * 2) / noteStrokes.length));

    const positions = noteStrokes.map((strokes, i) => {
      const angle = -Math.PI / 2 + (i / noteStrokes.length) * Math.PI * 2;
      const localBoundary = greenRadiusAtAngle(angle, controlPoints);
      const t = Math.sqrt(Math.min(strokes, 200) / 200);
      const radius = Math.min(localBoundary * Math.max(t, 0.035) * OVERSHOOT, R * 0.95);
      return { cx: R + radius * Math.cos(angle), cy: R + radius * Math.sin(angle), strokes };
    });

    const dots = positions.map(({ cx, cy, strokes }, i) => ({
      key: i,
      cx,
      cy,
      r: (3 + (Math.min(strokes, 200) / 200) * 4) * dotSizeScale,
      fill: strokeColorHex(strokes),
      opacity: dotOpacity,
    }));

    const acePositions = positions.filter((p) => p.strokes === 0);
    const aceRingStride = Math.max(1, Math.ceil(acePositions.length / 40));
    const aceRings = acePositions.filter((_, i) => i % aceRingStride === 0).map((p, i) => ({ key: i, cx: p.cx, cy: p.cy, r: 5.5 * dotSizeScale }));

    return { dots, aceRings };
  }, [noteStrokes, controlPoints, R]);

  const greenPathD = useMemo(() => buildGreenPathD(controlPoints, R, R), [controlPoints, R]);
  const cupSize = 9;
  const flagHeight = 24;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <path d={greenPathD} fill="rgba(54,211,153,0.16)" stroke="rgba(54,211,153,0.5)" strokeWidth={1.5} />
      {dots.map((d) => (
        <circle key={d.key} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} opacity={d.opacity} />
      ))}
      {aceRings.map((ring) => (
        <circle key={ring.key} cx={ring.cx} cy={ring.cy} r={ring.r} fill="none" stroke={STROKE_GOOD} strokeWidth={1.5} opacity={0.6} />
      ))}
      <circle cx={R} cy={R} r={cupSize / 2} fill="#0a0a0a" stroke="rgba(255,255,255,0.65)" strokeWidth={1.5} />
      <line x1={R} y1={R} x2={R} y2={R - flagHeight} stroke="rgba(255,255,255,0.75)" strokeWidth={2} />
      <polygon points={`${R},${R - flagHeight} ${R + 11},${R - flagHeight + 3.5} ${R},${R - flagHeight + 7}`} fill={STROKE_BAD} />
    </svg>
  );
}
