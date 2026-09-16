import { mulberry32, hashStringToSeed } from '../lib/prng';

// 5 made-up example plays for the scoring slide's cycling demo - not real submissions. Each spec is
// built from exact ace/OB counts (rather than probability weights) so the resulting totals are
// *guaranteed* (by construction, worst-case-checked below, not by luck of a random draw) to land in
// the range called out in the slide's brief, while the "filler" notes in between still get a bit of
// seeded random variation so the plot doesn't look mechanical.
//
// Per-note strokes use the same [0, 200] scale as calculateGolfStrokes (api/src/utils/scoring/golf.ts):
// 0 = ace, 200 = miss/out-of-bounds, everything else a timing-based penalty in between.
interface DemoPlaySpec {
  label: string;
  noteCount: number;
  aceCount: number;
  obCount: number;
  /** Inclusive range for every non-ace, non-OB note. Worst-case (all notes at midRange[1]) must
   * still keep the total under this spec's intended stroke bound - see the comment on each entry. */
  midRange: [number, number];
  seed: string;
}

const DEMO_PLAY_SPECS: DemoPlaySpec[] = [
  // 150 notes, 140 aces, 0 OB, 10 filler notes maxing out at 60 -> worst case total 600 (0.60 strokes) - well under 1.
  { label: 'Super accurate', noteCount: 150, aceCount: 140, obCount: 0, midRange: [10, 60], seed: 'demo-play-1' },
  // 200 notes, 100 aces, 1 OB (200), 99 filler notes maxing out at 25 -> worst case total 200 + 2475 = 2675 (2.68) - under 3.
  { label: 'Moderately accurate', noteCount: 200, aceCount: 100, obCount: 1, midRange: [5, 25], seed: 'demo-play-2' },
  // 700 notes ("way more notes"), 650 aces (highly accurate), 5 misses (1000), 45 filler notes maxing out at 80 -> worst case total 1000 + 3600 = 4600 (4.60) - under 6.
  { label: 'High note count, highly accurate', noteCount: 700, aceCount: 650, obCount: 5, midRange: [5, 80], seed: 'demo-play-3' },
  // 220 notes, 25 aces (inaccurate), 18 OB (many misses, 3600), 177 filler notes at least 5 -> best case total 3600 + 885 = 4485 (4.49) - guaranteed over 4 even in the best case.
  { label: 'Inaccurate', noteCount: 220, aceCount: 25, obCount: 18, midRange: [5, 25], seed: 'demo-play-4' },
  // 500 notes (high note count), 150 aces (less accurate), 3 OB (600), 347 filler notes maxing out at 25 -> worst case total 600 + 8675 = 9275 (9.28) - under 10.
  { label: 'High note count, less accurate', noteCount: 500, aceCount: 150, obCount: 3, midRange: [5, 25], seed: 'demo-play-5' },
];

function buildNoteStrokes(spec: DemoPlaySpec): number[] {
  const rng = mulberry32(hashStringToSeed(spec.seed));
  const fillerCount = spec.noteCount - spec.aceCount - spec.obCount;
  const [min, max] = spec.midRange;
  const notes = [
    ...Array(spec.aceCount).fill(0),
    ...Array(spec.obCount).fill(200),
    ...Array.from({ length: fillerCount }, () => min + Math.floor(rng() * (max - min + 1))),
  ];
  // Fisher-Yates - without this, misses/aces would cluster at one arc of the green (angle is
  // chronological index, and they're currently grouped by construction above) instead of scattering
  // the way a real play's timing would.
  for (let i = notes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [notes[i], notes[j]] = [notes[j], notes[i]];
  }
  return notes;
}

export interface DemoPlay {
  label: string;
  noteStrokes: number[];
  totalStrokes: number;
  aces: number;
  ob: number;
  /** Distinct from `seed` (used for note shuffling) so each play also gets its own green shape
   * (DispersionChart.tsx) instead of all 5 sharing one hole. */
  greenSeed: string;
  /** Index into DispersionChart's GREEN_VARIANTS - assigned by position (0-4) rather than hashed,
   * since there are exactly 5 variants for these 5 plays: a hash-based pick could land two plays on
   * the same variant family by chance, which a fixed 1-to-1 mapping can't. */
  greenVariant: number;
}

// Computed once at module load - deterministic and cheap enough (max 700 notes) that there's no
// need to memoize per-render on top of this.
export const DEMO_PLAYS: DemoPlay[] = DEMO_PLAY_SPECS.map((spec, i) => {
  const noteStrokes = buildNoteStrokes(spec);
  return {
    label: spec.label,
    noteStrokes,
    totalStrokes: noteStrokes.reduce((sum, s) => sum + s, 0),
    aces: noteStrokes.filter((s) => s === 0).length,
    ob: noteStrokes.filter((s) => s === 200).length,
    greenSeed: `${spec.seed}-green`,
    greenVariant: i,
  };
});
