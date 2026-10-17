import type { TerrainConfig } from './terrain';

// The backdrop comes in variants, one per kind of course, so a page can wear the scenery of the course it is about.
// A variant is two things: the shape of the land and what stands on it (this file), and its colours (the
// [data-backdrop=...] blocks in App.css, which are theme-aware). Add a variant by adding a key here, a colour block
// there, and - only if it needs a new kind of scenery - a plant, landmark or feature in Landscape.tsx.

/** In order: the letters A-E in conversation, and in the test switcher. */
export const VARIANT_ORDER = ['pines', 'sands', 'hills', 'meadow', 'prairie'] as const;
export type BackdropVariant = (typeof VARIANT_ORDER)[number];

export const DEFAULT_VARIANT: BackdropVariant = 'pines';

/** The letter for a variant ("A" for pines), as used in conversation and the test switcher. */
export const variantLetter = (variant: BackdropVariant): string => String.fromCharCode(65 + VARIANT_ORDER.indexOf(variant));

/** What `?bg=` accepts: a letter or a name. */
export const VARIANT_ALIASES: Record<string, BackdropVariant> = {
  ...Object.fromEntries(VARIANT_ORDER.map((v) => [v, v])),
  ...Object.fromEntries(VARIANT_ORDER.map((v) => [variantLetter(v).toLowerCase(), v])),
};

export type PlantKind = 'pine' | 'saguaro' | 'barrel' | 'boulder' | 'birch' | 'flower' | 'tuft' | 'wheat';

export interface LayerSpec {
  terrain: TerrainConfig;
  /** How far the layer rises over the whole scroll, px. Near layers move more: that is the parallax. */
  shift: number;
}

export interface Planting {
  /** Which layer's crest it stands on (0 far, 2 near). */
  layer: 0 | 1 | 2;
  kinds: readonly PlantKind[];
  seed: number;
  /** Height range, px. */
  size: readonly [number, number];
  /** One clump about every this many px of width, of 2-4 plants. */
  every: number;
  /** How far a clump's plants stray from its centre, px. Tight for a grove, loose for scattered plants. */
  spread?: number;
  /** Keep clear of the pin flags and landmarks. */
  avoidFlags?: boolean;
}

/** A single big thing standing on a layer, as a place to look at. */
export interface Landmark {
  kind: 'windmill';
  layer: 0 | 1 | 2;
  /** Horizontal position as a fraction of the width. */
  at: number;
  /** Height, px. */
  size: number;
}

/** A line that runs along a crest for stretches of the page. */
export interface Feature {
  kind: 'fence';
  layer: 0 | 1 | 2;
  /** Stretches as [from, to] fractions of the width. Kept to the margins, where it can be seen. */
  ranges: readonly (readonly [number, number])[];
}

/** Snow on the high parts of a layer: where the crest is above `threshold` (a fraction of the hill area's height),
 * as thick as `depth` (same unit) at the very top. */
export interface Snow {
  layer: 0 | 1 | 2;
  threshold: number;
  depth: number;
}

export interface VariantSpec {
  name: string;
  /** Scales the height of the hill area, for scenes that need room to rise (mountains). Default 1. */
  heightScale?: number;
  /** Three layers, far to near. Positions are fractions of the hill area's height, so proportions hold at any size. */
  layers: (h: number) => [LayerSpec, LayerSpec, LayerSpec];
  plantings: readonly Planting[];
  landmarks: readonly Landmark[];
  features: readonly Feature[];
  snow?: Snow;
  /** Pin flags on little greens, planted in the side margins. */
  flags: boolean;
  /** Which layer the flags stand on. The middle one by default; a variant whose middle layer is steep (mountains)
   * puts them on the gentle near slope instead, where a green sits flat. */
  flagLayer?: 0 | 1 | 2;
  /** Faint mowing stripes on the near layer. */
  stripes: boolean;
  /** How many of the drifting clouds to show, how solid, and how big. */
  clouds: { count: number; opacity: number; scale?: number };
  /** Fireflies over the land at night. */
  fireflies: boolean;
  /** Butterflies drifting by day. */
  butterflies: boolean;
  /** Stars in the night sky. */
  stars: number;
}

export const VARIANTS: Record<BackdropVariant, VariantSpec> = {
  // A: a parkland course - rolling green hills, pines, mowed fairway.
  pines: {
    name: 'Pines',
    layers: (h) => [
      {
        terrain: {
          seed: 3,
          baseline: h * 0.32,
          amplitude: h * 0.17,
          waves: [
            [1500, 1],
            [820, 0.7],
            [380, 0.3],
          ],
        },
        shift: 24,
      },
      {
        terrain: {
          seed: 9,
          baseline: h * 0.55,
          amplitude: h * 0.16,
          waves: [
            [1250, 1],
            [640, 0.6],
            [310, 0.25],
          ],
        },
        shift: 60,
      },
      {
        terrain: {
          seed: 17,
          baseline: h * 0.8,
          amplitude: h * 0.12,
          waves: [
            [1700, 1],
            [900, 0.5],
            [420, 0.18],
          ],
        },
        shift: 105,
      },
    ],
    plantings: [
      { layer: 0, kinds: ['pine'], seed: 31, size: [16, 28], every: 300 },
      { layer: 1, kinds: ['pine'], seed: 47, size: [30, 50], every: 300, avoidFlags: true },
    ],
    landmarks: [],
    features: [],
    flags: true,
    stripes: true,
    clouds: { count: 4, opacity: 0.9 },
    fireflies: true,
    butterflies: false,
    stars: 80,
  },
  // B: a desert course - flat-topped mesas far off, soft dunes, saguaros and barrel cacti, an oasis-green at each flag.
  sands: {
    name: 'Sands',
    layers: (h) => [
      {
        terrain: {
          seed: 5,
          baseline: h * 0.3,
          amplitude: h * 0.2,
          plateau: 2.6,
          waves: [
            [1300, 1],
            [760, 0.6],
            [440, 0.25],
          ],
        },
        shift: 22,
      },
      {
        terrain: {
          seed: 12,
          baseline: h * 0.56,
          amplitude: h * 0.14,
          waves: [
            [1450, 1],
            [680, 0.5],
            [320, 0.14],
          ],
        },
        shift: 58,
      },
      {
        terrain: {
          seed: 21,
          baseline: h * 0.8,
          amplitude: h * 0.11,
          waves: [
            [1800, 1],
            [940, 0.45],
            [450, 0.12],
          ],
        },
        shift: 100,
      },
    ],
    plantings: [
      { layer: 1, kinds: ['saguaro', 'saguaro', 'barrel'], seed: 61, size: [34, 62], every: 230, spread: 200, avoidFlags: true },
      { layer: 2, kinds: ['saguaro', 'barrel'], seed: 73, size: [48, 84], every: 480, spread: 220 },
    ],
    landmarks: [],
    features: [],
    flags: true,
    stripes: false,
    clouds: { count: 1, opacity: 0.55 },
    fireflies: false,
    butterflies: false,
    stars: 130,
  },
  // C: mountains - a tall, jagged, snow-capped range hazing into the distance, forested foothills, and a grassy
  // slope strewn with boulders.
  hills: {
    name: 'Hills',
    heightScale: 1.35,
    layers: (h) => [
      {
        terrain: {
          seed: 7,
          baseline: h * 0.4,
          amplitude: h * 0.3,
          ridged: true,
          waves: [
            [1150, 1],
            [640, 0.7],
            [340, 0.4],
            [180, 0.14],
          ],
        },
        shift: 26,
      },
      {
        terrain: {
          seed: 14,
          baseline: h * 0.6,
          amplitude: h * 0.17,
          ridged: true,
          waves: [
            [950, 1],
            [500, 0.6],
            [270, 0.25],
          ],
        },
        shift: 62,
      },
      {
        terrain: {
          seed: 23,
          baseline: h * 0.84,
          amplitude: h * 0.08,
          waves: [
            [1900, 1],
            [900, 0.4],
            [430, 0.1],
          ],
        },
        shift: 105,
      },
    ],
    plantings: [
      { layer: 1, kinds: ['pine'], seed: 83, size: [22, 40], every: 240, spread: 120, avoidFlags: true },
      { layer: 2, kinds: ['boulder', 'boulder', 'tuft'], seed: 89, size: [12, 26], every: 260, spread: 160, avoidFlags: true },
    ],
    landmarks: [],
    features: [],
    snow: { layer: 0, threshold: 0.56, depth: 0.28 },
    flags: true,
    flagLayer: 2,
    stripes: false,
    clouds: { count: 4, opacity: 0.95, scale: 1.2 },
    fireflies: false,
    butterflies: false,
    stars: 90,
  },
  // D: a wildflower meadow - low, gentle land thick with flowers and grass, a few birches, butterflies by day.
  meadow: {
    name: 'Meadow',
    layers: (h) => [
      {
        terrain: {
          seed: 11,
          baseline: h * 0.36,
          amplitude: h * 0.1,
          waves: [
            [1600, 1],
            [800, 0.5],
            [380, 0.15],
          ],
        },
        shift: 20,
      },
      {
        terrain: {
          seed: 19,
          baseline: h * 0.58,
          amplitude: h * 0.08,
          waves: [
            [1500, 1],
            [720, 0.5],
            [340, 0.15],
          ],
        },
        shift: 50,
      },
      {
        terrain: {
          seed: 29,
          baseline: h * 0.82,
          amplitude: h * 0.07,
          waves: [
            [1900, 1],
            [880, 0.4],
            [400, 0.12],
          ],
        },
        shift: 90,
      },
    ],
    plantings: [
      { layer: 0, kinds: ['birch'], seed: 97, size: [28, 44], every: 420, spread: 80 },
      { layer: 1, kinds: ['birch', 'flower', 'flower', 'tuft'], seed: 101, size: [30, 58], every: 280, spread: 110, avoidFlags: true },
      { layer: 2, kinds: ['flower', 'flower', 'flower', 'tuft', 'tuft'], seed: 103, size: [24, 50], every: 140, spread: 160 },
    ],
    landmarks: [],
    features: [],
    flags: true,
    stripes: false,
    clouds: { count: 3, opacity: 0.85 },
    fireflies: true,
    butterflies: true,
    stars: 60,
  },
  // E: open prairie - a very flat horizon under a big sky, waving grain, a windmill, and a fence running off.
  prairie: {
    name: 'Prairie',
    layers: (h) => [
      {
        terrain: {
          seed: 13,
          baseline: h * 0.4,
          amplitude: h * 0.05,
          waves: [
            [2200, 1],
            [1100, 0.4],
            [500, 0.1],
          ],
        },
        shift: 14,
      },
      {
        terrain: {
          seed: 27,
          baseline: h * 0.6,
          amplitude: h * 0.06,
          waves: [
            [2000, 1],
            [980, 0.4],
            [460, 0.1],
          ],
        },
        shift: 36,
      },
      {
        terrain: {
          seed: 37,
          baseline: h * 0.82,
          amplitude: h * 0.06,
          waves: [
            [2400, 1],
            [1000, 0.3],
            [480, 0.08],
          ],
        },
        shift: 70,
      },
    ],
    plantings: [
      { layer: 1, kinds: ['wheat', 'wheat', 'tuft'], seed: 107, size: [20, 40], every: 200, spread: 150, avoidFlags: true },
      { layer: 2, kinds: ['wheat', 'wheat', 'tuft'], seed: 109, size: [28, 56], every: 170, spread: 170 },
    ],
    landmarks: [{ kind: 'windmill', layer: 1, at: 0.13, size: 100 }],
    features: [
      {
        kind: 'fence',
        layer: 2,
        ranges: [
          [0, 0.19],
          [0.81, 1],
        ],
      },
    ],
    flags: true,
    stripes: false,
    clouds: { count: 4, opacity: 0.95, scale: 1.7 },
    fireflies: false,
    butterflies: false,
    stars: 140,
  },
};
