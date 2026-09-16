import { calculateGolfStrokes } from '../../../src/utils/scoring/golf';
import type { PlaySubmission, TimingDatum, Radar } from '../../../src/utils/scoring';

// Only timingData and radar affect calculateGolfStrokes - every other PlaySubmission field is
// required by the schema but irrelevant here, so this stub exists purely to satisfy the type.
function buildSubmission(timingData: TimingDatum[], radar: Radar): PlaySubmission {
  return {
    songName: 'Test Song',
    artist: 'Test Artist',
    pack: 'Test Pack',
    length: '1:30',
    hash: 'testhash',
    timingData,
    radar,
    difficulty: 'Challenge',
    stepartist: 'Test Stepartist',
    lifebarInfo: [{ x: 0, y: 1 }],
    npsInfo: { peakNPS: 10, points: [{ x: 0, y: 0 }] },
    modifiers: {
      visualDelay: 0,
      acceleration: [],
      appearance: [],
      effect: [],
      mini: 0,
      turn: 'None',
      disabledWindows: '',
      speed: { value: 1, type: 'x' },
      perspective: 'Overhead',
      noteskin: 'default',
    },
    musicRate: 1,
    usedAutoplay: false,
    passed: true,
    _arrowCloudBodyVersion: '1.0',
    _engineName: 'ITGMania',
  };
}

const noRadar: Radar = { Holds: [0, 0], Mines: [0, 0], Rolls: [0, 0] };

describe('calculateGolfStrokes', () => {
  it('scores an ace (<=4ms offset) as 0 strokes', () => {
    const { totalStrokes } = calculateGolfStrokes(buildSubmission([[0, 0.003]], noRadar));
    expect(totalStrokes).toBe(0);
  });

  it('scores exactly 4ms as an ace (boundary is inclusive)', () => {
    const { totalStrokes } = calculateGolfStrokes(buildSubmission([[0, 0.004]], noRadar));
    expect(totalStrokes).toBe(0);
  });

  it('scores a mid-range offset as floor(ms) - 4', () => {
    // 50ms -> floor(50) - 4 = 46
    const { totalStrokes } = calculateGolfStrokes(buildSubmission([[0, 0.05]], noRadar));
    expect(totalStrokes).toBe(46);
  });

  it('scores negative (early) offsets the same as positive (late) via abs()', () => {
    const early = calculateGolfStrokes(buildSubmission([[0, -0.05]], noRadar));
    const late = calculateGolfStrokes(buildSubmission([[0, 0.05]], noRadar));
    expect(early.totalStrokes).toBe(late.totalStrokes);
  });

  it('caps at 200 strokes just past the 103.5ms boundary', () => {
    const { totalStrokes } = calculateGolfStrokes(buildSubmission([[0, 0.1036]], noRadar));
    expect(totalStrokes).toBe(200);
  });

  it('scores exactly 103.5ms as still within range (boundary is exclusive above)', () => {
    // 103.5ms -> floor(103.5) - 4 = 99, not the 200 cap
    const { totalStrokes } = calculateGolfStrokes(buildSubmission([[0, 0.1035]], noRadar));
    expect(totalStrokes).toBe(99);
  });

  it('scores a literal Miss as 200 strokes', () => {
    const { totalStrokes } = calculateGolfStrokes(buildSubmission([[0, 'Miss']], noRadar));
    expect(totalStrokes).toBe(200);
  });

  it('sums strokes across multiple notes', () => {
    const { totalStrokes, noteCount } = calculateGolfStrokes(
      buildSubmission(
        [
          [0, 0.002], // 0
          [1, 0.05], // 46
          [2, 'Miss'], // 200
        ],
        noRadar,
      ),
    );
    expect(totalStrokes).toBe(246);
    expect(noteCount).toBe(3);
  });

  it('adds 200 strokes per dropped hold', () => {
    const { totalStrokes } = calculateGolfStrokes(buildSubmission([[0, 0]], { Holds: [3, 5], Mines: [0, 0], Rolls: [0, 0] }));
    // 2 dropped holds (5 total - 3 held) * 200 = 400
    expect(totalStrokes).toBe(400);
  });

  it('adds 200 strokes per dropped roll', () => {
    const { totalStrokes } = calculateGolfStrokes(buildSubmission([[0, 0]], { Holds: [0, 0], Mines: [0, 0], Rolls: [1, 2] }));
    expect(totalStrokes).toBe(200);
  });

  it('adds 200 strokes per mine hit (mines dodged does not add strokes)', () => {
    const allDodged = calculateGolfStrokes(buildSubmission([[0, 0]], { Holds: [0, 0], Mines: [4, 4], Rolls: [0, 0] }));
    expect(allDodged.totalStrokes).toBe(0);

    const oneHit = calculateGolfStrokes(buildSubmission([[0, 0]], { Holds: [0, 0], Mines: [3, 4], Rolls: [0, 0] }));
    expect(oneHit.totalStrokes).toBe(200);
  });

  it('combines tap, hold, roll, and mine penalties in one submission', () => {
    const { totalStrokes } = calculateGolfStrokes(
      buildSubmission(
        [
          [0, 0.003], // 0
          [1, 'Miss'], // 200
        ],
        { Holds: [1, 2], Mines: [0, 1], Rolls: [1, 1] },
      ),
    );
    // taps: 200, + 1 dropped hold (200) + 1 mine hit (200) + 0 dropped rolls = 600
    expect(totalStrokes).toBe(600);
  });
});
