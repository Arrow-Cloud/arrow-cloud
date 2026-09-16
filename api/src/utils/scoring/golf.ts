import type { TimingDatum, Radar } from './index';

// Only timingData and radar affect this formula - narrower than the full PlaySubmission so callers
// (like events/golf/backend/src/score-processor.ts, which gets these two fields from the public
// /play/{id} endpoint, not a full submission) don't need to fabricate the rest of the shape.
export interface GolfScoreInput {
  timingData: readonly TimingDatum[];
  radar: Radar;
}

// Verified against GolfScoring.lua (the client-side HUD overlay) and the actual submission payload
// shape - PlaySubmission.timingData only carries tap-note offsets (in seconds, hence the *1000
// below); mines/holds/rolls have no per-note identity in the payload at all, only pre-aggregated
// counts in submission.radar, which is sufficient since golf's penalty for any of them is a flat
// 200 regardless of which specific note it was.
function calcStrokes(offset: number | 'Miss'): number {
  if (offset === 'Miss') return 200;
  const ms = Math.abs(offset) * 1000;
  if (ms <= 4) return 0;
  if (ms > 103.5) return 200;
  return Math.floor(ms) - 4;
}

// Deliberately not built on SubmissionCalculator (./index.ts) - that's hardwired to a "percentage of
// computed max, floored, clamped >=0" formula, incompatible with a raw, uncapped, lower-is-better
// stroke sum. Zero dependencies (no PrismaClient, no AWS SDK - only a type-level import from
// ./index, erased at compile time) so this can be imported both by the core API and, via a plain
// relative import, by events/golf/backend/src/score-processor.ts without pulling that Lambda's
// bundle into a dependency on core API internals.
export interface GolfScoreResult {
  totalStrokes: number;
  noteCount: number;
  /** Per-tap-note strokes, in chronological order (mine/hold/roll penalties are aggregate-only and
   * have no per-note identity in the payload, so they're folded into totalStrokes but not here) -
   * drives golf-result-image.ts's dispersion chart and ACES/OB counts. */
  noteStrokes: number[];
}

export function calculateGolfStrokes(input: GolfScoreInput): GolfScoreResult {
  const noteStrokes = input.timingData.map(([, offset]) => calcStrokes(offset));
  let totalStrokes = noteStrokes.reduce((sum, strokes) => sum + strokes, 0);

  const [heldCount, totalHolds] = input.radar.Holds;
  const [rollCount, totalRolls] = input.radar.Rolls;
  const [minesDodged, totalMines] = input.radar.Mines;
  totalStrokes += (totalHolds - heldCount + (totalRolls - rollCount) + (totalMines - minesDodged)) * 200;

  return { totalStrokes, noteCount: input.timingData.length, noteStrokes };
}
