import { ENGINES } from '../../../src/utils/scoring';
import {
  ALLOWED_AUTOPLAY_USERS,
  DEADSYNC_ENGINE_NAME,
  checkGolfEligibility,
  isSubmissionEligible,
  type EligibilityInputs,
} from '../../../src/utils/scoring/eligibility';

const ALLOWED_AUTOPLAY_USER = ALLOWED_AUTOPLAY_USERS[0];
const ORDINARY_USER = '00000000-0000-0000-0000-000000000000';

function inputs(overrides: Partial<EligibilityInputs> = {}): EligibilityInputs {
  return { bodyVersion: '1.4', engineName: ENGINES.ITGMania, musicRate: 1, usedAutoplay: false, passed: true, ...overrides };
}

describe('eligibility constants', () => {
  // eligibility.ts must stay dependency-free so events/golf/backend can import it without pulling
  // PrismaClient into its Lambda bundle, so it carries its own copy of the engine name. ENGINES is
  // not `as const`, so this can't be asserted at the type level without widening PlaySubmission's
  // _engineName - hence a test. If ENGINES.DeadSync is ever renamed, this fails rather than the
  // DeadSync version check silently never matching again.
  it('keeps DEADSYNC_ENGINE_NAME in sync with ENGINES.DeadSync', () => {
    expect(DEADSYNC_ENGINE_NAME).toBe(ENGINES.DeadSync);
  });
});

describe('isSubmissionEligible (standard leaderboards)', () => {
  it('accepts a clean submission', () => {
    expect(isSubmissionEligible(inputs(), true)).toBe(true);
  });

  it.each([
    ['pre-finalized schema', { bodyVersion: '1.1' }],
    ['affected DeadSync range', { bodyVersion: '1.3', engineName: ENGINES.DeadSync }],
    ['autoplay', { usedAutoplay: true }],
    ['did not pass', { passed: false }],
  ])('rejects %s', (_label, overrides) => {
    expect(isSubmissionEligible(inputs(overrides), true)).toBe(false);
  });

  it('defers the rate clause to the caller, since subclasses vary it', () => {
    expect(isSubmissionEligible(inputs({ musicRate: 1.2 }), false)).toBe(false);
    expect(isSubmissionEligible(inputs({ musicRate: 1.2 }), true)).toBe(true);
  });

  it('accepts DeadSync at or above the fixed version', () => {
    expect(isSubmissionEligible(inputs({ bodyVersion: '1.4', engineName: ENGINES.DeadSync }), true)).toBe(true);
  });
});

describe('checkGolfEligibility', () => {
  it('accepts a clean passing play at rate 1', () => {
    expect(checkGolfEligibility(inputs(), ORDINARY_USER)).toEqual({ eligible: true, reasons: [] });
  });

  it('rejects a play that was not passed', () => {
    expect(checkGolfEligibility(inputs({ passed: false }), ORDINARY_USER).reasons).toEqual(['not-passed']);
  });

  // Stricter than core's rate-eligible variants, which allow >= 1: golf scores raw milliseconds
  // against windows that don't scale with rate, so any rate change moves the measurement scale.
  it.each([0.8, 1.1, 1.5])('rejects rate %s, including rates above 1', (musicRate) => {
    expect(checkGolfEligibility(inputs({ musicRate }), ORDINARY_USER).reasons).toEqual(['rate-modded']);
  });

  it('rejects autoplay for an ordinary user', () => {
    expect(checkGolfEligibility(inputs({ usedAutoplay: true }), ORDINARY_USER).reasons).toEqual(['autoplay']);
  });

  it('allows autoplay for an allow-listed user', () => {
    expect(checkGolfEligibility(inputs({ usedAutoplay: true }), ALLOWED_AUTOPLAY_USER)).toEqual({ eligible: true, reasons: [] });
  });

  it('rejects the affected DeadSync range', () => {
    expect(checkGolfEligibility(inputs({ bodyVersion: '1.3', engineName: ENGINES.DeadSync }), ORDINARY_USER).reasons).toEqual(['deadsync-affected-version']);
  });

  // Golf reads only timingData and radar, which older submissions carry correctly, so unlike the
  // standard boards it does not apply the 1.2 schema floor.
  it('does not apply the standard MIN_BODY_VERSION floor', () => {
    expect(checkGolfEligibility(inputs({ bodyVersion: '1.0' }), ORDINARY_USER).eligible).toBe(true);
    expect(isSubmissionEligible(inputs({ bodyVersion: '1.0' }), true)).toBe(false);
  });

  it('reports every reason at once', () => {
    const { eligible, reasons } = checkGolfEligibility(inputs({ passed: false, musicRate: 1.5, usedAutoplay: true }), ORDINARY_USER);
    expect(eligible).toBe(false);
    expect(reasons).toEqual(['not-passed', 'rate-modded', 'autoplay']);
  });
});
