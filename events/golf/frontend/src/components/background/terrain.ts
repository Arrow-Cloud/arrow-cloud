import { seededRandom } from './useScrollVars';

// Terrain for the backdrop's hills: a crest height for every x, measured in px. Because the scene is drawn at the
// viewport's real pixel size (never scaled to fit), a wider window simply shows more of the same land instead of
// stretching it - and anything planted on a hill (a tree, a flag) asks the same function for its height, so it
// always stands exactly on the crest.

export interface TerrainConfig {
  seed: number;
  /** Mean crest height, px down from the top of the hill area. */
  baseline: number;
  /** Peak-to-mean swing, px. */
  amplitude: number;
  /** Component waves as [wavelength px, weight]. Long, gentle ones read as hills; short ones as texture. */
  waves: readonly (readonly [number, number])[];
  /** Squashes the swing toward flat tops and steep sides: 0 or absent is rolling hills, ~2.5 is a mesa. */
  plateau?: number;
  /** Folds each wave about its zero line, turning soft hills into sharp peaks over rounded valleys: mountains. */
  ridged?: boolean;
}

export type Crest = (x: number) => number;

export function makeCrest({ seed, baseline, amplitude, waves, plateau, ridged }: TerrainConfig): Crest {
  const rand = seededRandom(seed);
  const phases = waves.map(() => rand() * Math.PI * 2);
  const totalWeight = waves.reduce((sum, [, weight]) => sum + weight, 0);
  return (x) => {
    let sum = 0;
    waves.forEach(([wavelength, weight], i) => {
      const wave = Math.sin((2 * Math.PI * x) / wavelength + phases[i]);
      // Ridged: 1 - 2|sin| is +1 at each zero crossing, as a sharp point, and -1 between them, as a smooth trough.
      sum += weight * (ridged ? 1 - 2 * Math.abs(wave) : wave);
    });
    const swing = sum / totalWeight;
    const shaped = plateau ? Math.tanh(plateau * swing) / Math.tanh(plateau) : swing;
    return baseline - amplitude * shaped;
  };
}

/** A filled hill: the crest across the width, closed off well below the visible area so a layer that has risen
 * with the parallax never shows a gap under itself. */
export function hillPath(crest: Crest, width: number, bottom: number, step = 8): string {
  const points: string[] = [];
  for (let x = -step; x <= width + step; x += step) points.push(`${x.toFixed(1)},${crest(x).toFixed(1)}`);
  return `M${points.join('L')}L${width + step},${bottom}L${-step},${bottom}Z`;
}

/** Just the crest line, for a faint rim light along the top of a hill. */
export function crestLine(crest: Crest, width: number, step = 8): string {
  const points: string[] = [];
  for (let x = -step; x <= width + step; x += step) points.push(`${x.toFixed(1)},${crest(x).toFixed(1)}`);
  return `M${points.join('L')}`;
}

/**
 * Snow on the high parts of a crest. Only where the crest rises above `threshold` (px, same axis as the crest) does
 * snow lie, and it lies thicker the higher the rock - up to `depth` - with a jagged lower edge, tapering to nothing
 * where the crest drops back below the line. So a peak gets a cap and a ridge gets a dusting, never a flat white band.
 */
export function snowPath(crest: Crest, width: number, threshold: number, depth: number, step = 4): string {
  const paths: string[] = [];
  let top: [number, number][] = [];
  const close = () => {
    if (top.length > 2) {
      const edge = top.map(([x, y]) => {
        const above = Math.max(0, threshold - y) / Math.max(1, depth * 2);
        // A zigzag keeps the lower edge ragged, like snow settling into the rock's gullies.
        const zig = 0.55 + 0.45 * Math.abs(Math.sin(x / 7.3) * Math.cos(x / 19.1));
        return [x, y + Math.min(1, above) * depth * zig] as [number, number];
      });
      const pts = [...top, ...edge.reverse()].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`);
      paths.push(`M${pts.join('L')}Z`);
    }
    top = [];
  };
  for (let x = -step; x <= width + step; x += step) {
    const y = crest(x);
    if (y < threshold) top.push([x, y]);
    else close();
  }
  close();
  return paths.join('');
}
