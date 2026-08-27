import { Play } from '../../../prisma/generated';
import { PrismaClient } from '../../../prisma/generated/client';
import { ENGINES, GradingSystem, PlaySubmission, ScoringSystem, SubmissionCalculator } from '../scoring';

export interface ILeaderboard {
  isEligible: () => boolean;
  serializeData: () => Promise<LeaderboardData>;
  getSortKey: () => Promise<string>;
  getName: () => string;
  getId: () => number;
}

type LeaderboardData = {
  // differing boards may use different metrics, to be clearly intentional about how the data
  // should be rendered client side we will store even numeric scores as strings
  score: string;
  grade: string;
  judgments: Record<string, number>;
  radar: {
    holdsHeld: number;
    holdsTotal: number;
    minesDodged: number;
    minesTotal: number;
    rollsHit: number;
    rollsTotal: number;
  };
  // Music rate the play was performed at (1 = unmodded). Always 1 for the standard leaderboards
  // (musicRate === 1 is required for eligibility there), but can be >= 1 for the rate-eligible
  // leaderboard variants.
  musicRate: number;
};

// We want earlier plays to win ties. We sort overall by sortKey DESC.
// Current sortKey prefix is padded score (higher better). For tie-breaking we need
// a component that is higher for earlier timestamps. We invert the epoch milliseconds
// relative to a far-future constant (year 2500) so earlier dates yield bigger inverted values.
// Format: <SCORE>-<INVERTED_EPOCH>-<ISO_TIMESTAMP>
// This keeps existing human-readable ISO while ensuring deterministic tie order.
const INVERT_EPOCH_BASE = Date.UTC(2500, 0, 1, 0, 0, 0, 0); // Jan 1 2500 UTC
function buildTieBreakComponent(date: Date): string {
  const inverted = INVERT_EPOCH_BASE - date.getTime();
  // Pad to fixed width (13 digits for ms up to year 2500) to preserve lexicographic order
  return inverted.toString().padStart(13, '0');
}

export const ALLOWED_AUTOPLAY_USERS = ['3ac37479-c87f-459c-b3aa-c17e95c1a0d8', 'f7e9cf36-cbc8-4330-9389-292b4034c043'];

export class BaseLeaderboard {
  protected calculator: SubmissionCalculator;

  constructor(
    public play: Play,
    public submissionData: PlaySubmission,
    protected scoringSystem: ScoringSystem,
    protected gradingSystem: GradingSystem,
    prisma: PrismaClient,
    calculator?: SubmissionCalculator,
  ) {
    // calculator absorbs some in memory caching
    this.calculator = calculator ?? new SubmissionCalculator(submissionData, prisma);
  }

  // Base class can have common functionality for all leaderboards
  // e.g. fetching leaderboard metadata, common validation, etc.

  // For the standard leaderboards ArrowCloud does not accept rate modded plays.
  // As a timing focused platform, speeding up a chart and getting a better score as a result
  // just means that the player is doing worse at timing slowly. Rate-eligible leaderboard
  // variants (see ITGRateLeaderboard/EXRateLeaderboard) relax this to musicRate >= 1.
  protected isRateEligible(): boolean {
    return this.submissionData.musicRate === 1;
  }

  isEligible(): boolean {
    // Old submissions before schema was finalized are not eligible
    if (parseFloat(this.submissionData._arrowCloudBodyVersion) < 1.2) {
      return false;
    }

    // DeadSync had a bug in submissions prior to a certain version, in addition to a breakage with semver for
    // checking engine version, so we required DeadSync to start sending submissions with bodyVersion 1.4+
    // so we can reject requests from that engine where the bug was present.
    if (this.submissionData._engineName === ENGINES.DeadSync && parseFloat(this.submissionData._arrowCloudBodyVersion) < 1.4) {
      return false;
    }

    if (!this.isRateEligible()) {
      return false;
    }

    // No autoplay
    if (this.submissionData.usedAutoplay) {
      return false;
    }

    // Must have passed the chart
    if (!this.submissionData.passed) {
      return false;
    }

    // Additional future checks would short‑circuit here.
    return true;
  }

  async serializeData(): Promise<LeaderboardData> {
    // Serialize the play data for the leaderboard
    const score = await this.calculator.calculateScore(this.scoringSystem);
    const grade = await this.calculator.calculateGrade(this.gradingSystem);
    const judgments = this.calculator.getJudgments(this.scoringSystem);
    const [heldCount, totalHolds] = this.submissionData.radar.Holds;
    const [minesDodged, totalMines] = this.submissionData.radar.Mines;
    const [rollCount, totalRolls] = this.submissionData.radar.Rolls;
    return {
      score: score.score.toFixed(2),
      grade,
      judgments,
      radar: {
        holdsHeld: heldCount,
        holdsTotal: totalHolds,
        minesDodged,
        minesTotal: totalMines,
        rollsHit: rollCount,
        rollsTotal: totalRolls,
      },
      musicRate: this.submissionData.musicRate,
    };
  }

  async getSortKey(): Promise<string> {
    // Generate a sort key based on the score with earlier timestamps ordering ahead when sorted DESC
    const score = await this.calculator.calculateScore(this.scoringSystem);
    const paddedScore = score.score.toFixed(2).replace('.', '').padStart(5, '0');
    const tieBreak = buildTieBreakComponent(this.play.createdAt);
    return `${paddedScore}-${tieBreak}-${this.play.createdAt.toISOString()}`;
  }
}

export class HardEXLeaderboard extends BaseLeaderboard implements ILeaderboard {
  getName() {
    return 'HardEX';
  }

  getId() {
    return GLOBAL_HARD_EX_LEADERBOARD_ID;
  }
}

export class EXLeaderboard extends BaseLeaderboard implements ILeaderboard {
  getName() {
    return 'EX';
  }

  getId() {
    return GLOBAL_EX_LEADERBOARD_ID;
  }
}

export class ITGLeaderboard extends BaseLeaderboard implements ILeaderboard {
  getName() {
    return 'ITG';
  }

  getId() {
    return GLOBAL_MONEY_LEADERBOARD_ID;
  }
}

// Rate-eligible variants: same scoring/grading as their standard counterparts, but plays with
// musicRate >= 1 (rate mods) are eligible too. Not part of DEFAULT_LEADERBOARDS - these are not
// shown in default frontend leaderboard views, but are computed for every score submission so
// rate-modded players still have complete data available (e.g. session stats).
export class ITGRateLeaderboard extends BaseLeaderboard implements ILeaderboard {
  protected isRateEligible(): boolean {
    return this.submissionData.musicRate >= 1;
  }

  getName() {
    return 'ITG (Rate Eligible)';
  }

  getId() {
    return GLOBAL_ITG_RATE_LEADERBOARD_ID;
  }
}

export class EXRateLeaderboard extends BaseLeaderboard implements ILeaderboard {
  protected isRateEligible(): boolean {
    return this.submissionData.musicRate >= 1;
  }

  getName() {
    return 'EX (Rate Eligible)';
  }

  getId() {
    return GLOBAL_EX_RATE_LEADERBOARD_ID;
  }
}

export const GLOBAL_EX_LEADERBOARD_ID = 2;
export const GLOBAL_MONEY_LEADERBOARD_ID = 3;
export const GLOBAL_HARD_EX_LEADERBOARD_ID = 4;
export const GLOBAL_ITG_RATE_LEADERBOARD_ID = 18;
export const GLOBAL_EX_RATE_LEADERBOARD_ID = 19;
export const DEFAULT_LEADERBOARDS = [GLOBAL_HARD_EX_LEADERBOARD_ID, GLOBAL_EX_LEADERBOARD_ID, GLOBAL_MONEY_LEADERBOARD_ID];
// Every global leaderboard that gets computed on each score submission (includes non-default,
// rate-eligible variants). Used by full-recalculation tooling.
export const ALL_GLOBAL_LEADERBOARDS = [...DEFAULT_LEADERBOARDS, GLOBAL_ITG_RATE_LEADERBOARD_ID, GLOBAL_EX_RATE_LEADERBOARD_ID];
