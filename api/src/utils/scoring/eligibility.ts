/**
 * Submission eligibility rules, as a pure zero-dependency module.
 *
 * Deliberately free of PrismaClient / AWS SDK imports (only type-level imports, erased at compile
 * time) for the same reason api/src/utils/scoring/golf.ts is: events/golf/backend/ imports this
 * directly via a relative path, and must not drag core API internals into its Lambda bundle. The
 * alternative - golf hand-copying the rules - is exactly how two rule sets drift apart.
 */

/** Users permitted to use autoplay and still count. Kept here rather than in ../leaderboard (which
 * imports PrismaClient) so both core and the golf Lambda can read the same list. */
export const ALLOWED_AUTOPLAY_USERS = ['3ac37479-c87f-459c-b3aa-c17e95c1a0d8', 'f7e9cf36-cbc8-4330-9389-292b4034c043'];

/** Mirrors ENGINES.DeadSync from ./index. Not imported from there because that module pulls in
 * PrismaClient; ./index asserts at compile time that these two agree. */
export const DEADSYNC_ENGINE_NAME = 'DeadSync';

/** DeadSync shipped a submission bug, and its own semver was broken in a way that made version
 * comparison unreliable, so it was required to start sending bodyVersion 1.4+. Anything below that
 * from DeadSync is from the affected range. */
export const DEADSYNC_MIN_BODY_VERSION = 1.4;

/** Submissions predating the finalized schema. Applied by the standard leaderboards; golf does not
 * apply it, since golf scores from timingData/radar, which those submissions still carry correctly. */
export const MIN_BODY_VERSION = 1.2;

export interface EligibilityInputs {
  /** PlaySubmission._arrowCloudBodyVersion */
  bodyVersion: string;
  /** PlaySubmission._engineName */
  engineName: string;
  musicRate: number;
  usedAutoplay: boolean;
  passed: boolean;
}

function isAffectedDeadSync(input: EligibilityInputs): boolean {
  return input.engineName === DEADSYNC_ENGINE_NAME && parseFloat(input.bodyVersion) < DEADSYNC_MIN_BODY_VERSION;
}

/**
 * The standard-leaderboard rule, extracted from BaseLeaderboard.isEligible so it can be evaluated
 * without constructing a leaderboard (which needs a scoring system, a grading system and a Prisma
 * client). `rateEligible` is passed in rather than decided here because it is the one clause
 * subclasses vary: the standard boards require musicRate === 1, the rate-eligible variants relax it
 * to >= 1.
 */
export function isSubmissionEligible(input: EligibilityInputs, rateEligible: boolean): boolean {
  if (parseFloat(input.bodyVersion) < MIN_BODY_VERSION) return false;
  if (isAffectedDeadSync(input)) return false;
  if (!rateEligible) return false;
  if (input.usedAutoplay) return false;
  if (!input.passed) return false;
  return true;
}

export type GolfIneligibilityReason = 'not-passed' | 'rate-modded' | 'autoplay' | 'deadsync-affected-version';

/**
 * Golf's own rule. Related to the standard one but not identical in either direction, which is why
 * it is spelled out rather than delegating:
 *
 * - **Stricter on rate**: musicRate must be exactly 1. Core's rate-eligible leaderboard variants
 *   accept >= 1, but golf scores raw milliseconds of timing error against windows that do not scale
 *   with rate, so a rate change moves the scale the score is measured on. (Core's own comment on
 *   the standard rule applies with more force here: speeding a chart up and scoring better just
 *   means doing worse at timing slowly.)
 * - **Looser on autoplay**: the ALLOWED_AUTOPLAY_USERS exemption applies, as it already does for
 *   the Blue Shift event configs. Note that for golf autoplay is not a marginal advantage but a
 *   perfect one - autoplay hits every note dead on, which is a zero-stroke round - so this
 *   exemption only exists for the accounts trusted to exercise the pipeline.
 * - **Looser on body version**: the MIN_BODY_VERSION floor is not applied. It guards schema fields
 *   golf does not read; golf needs only timingData and radar, which older submissions carry
 *   correctly. The DeadSync check is applied, because that one is about submissions being wrong.
 *
 * Returns the reasons rather than a bare boolean so the score processor can log exactly why a play
 * was excluded - with no leaderboard UI yet, a log line is the only way to see it happen.
 */
export function checkGolfEligibility(input: EligibilityInputs, userId: string): { eligible: boolean; reasons: GolfIneligibilityReason[] } {
  const reasons: GolfIneligibilityReason[] = [];

  if (!input.passed) reasons.push('not-passed');
  if (input.musicRate !== 1) reasons.push('rate-modded');
  if (input.usedAutoplay && !ALLOWED_AUTOPLAY_USERS.includes(userId)) reasons.push('autoplay');
  if (isAffectedDeadSync(input)) reasons.push('deadsync-affected-version');

  return { eligible: reasons.length === 0, reasons };
}
