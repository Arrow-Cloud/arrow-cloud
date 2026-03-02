import { z } from 'zod';
import { PrismaClient } from '../../../prisma/generated';
import { parseChartCounts } from '../simfile/chart-parser';

// Timing datum: only time and offset are required; additional elements are optional and may be omitted
const TimingDatumSchema = z
  .tuple([
    z.number(), // courseOffset + GAMESTATE:GetCurMusicSeconds()
    z.union([z.number(), z.literal('Miss')]), // offset ("Miss" or number)
  ])
  // Accept any optional trailing values (arrowType, isStream, foot, early, earlyOffset, heldMiss, etc.)
  .rest(z.any());

const RadarSchema = z.object({
  Holds: z.tuple([z.number(), z.number()]),
  Mines: z.tuple([z.number(), z.number()]),
  Rolls: z.tuple([z.number(), z.number()]),
});

const LifebarPointSchema = z.object({ x: z.number(), y: z.number() });
const LifebarInfoSchema = z.array(LifebarPointSchema).min(1, 'lifebarInfo must contain at least one point');

const NpsPointSchema = z.object({ x: z.number(), y: z.number(), measure: z.number().optional(), nps: z.number().optional() });
const NpsInfoSchema = z.object({
  peakNPS: z.number(),
  points: z.array(NpsPointSchema).min(1, 'npsInfo.points must contain at least one point'),
});

const ModifiersSchema = z.object({
  visualDelay: z.number(),
  acceleration: z.array(z.unknown()),
  appearance: z.array(z.unknown()),
  effect: z.array(z.unknown()),
  mini: z.number(),
  turn: z.string(),
  disabledWindows: z.string(),
  speed: z.object({
    value: z.number(),
    type: z.string(),
  }),
  perspective: z.string(),
  noteskin: z.string(),
});

const ENGINES = {
  ITGMania: 'ITGMania',
  DeadSync: 'DeadSync',
};

export const PlaySubmissionSchema = z.object({
  songName: z.string(),
  artist: z.string(),
  pack: z.string(),
  length: z.string(), // mm:ss or m:ss
  hash: z.string(),
  timingData: z.array(TimingDatumSchema).min(1, 'timingData must contain hit rows'),
  radar: RadarSchema,
  difficulty: z.union([z.string(), z.number()]),
  stepartist: z.string(),
  lifebarInfo: LifebarInfoSchema,
  npsInfo: NpsInfoSchema,
  modifiers: ModifiersSchema,
  musicRate: z.number(),
  usedAutoplay: z.boolean(),
  passed: z.boolean(),
  wasPending: z.boolean().optional(),
  pendingDate: z.string().optional(),
  _arrowCloudBodyVersion: z.string().default('1.0'),
  _engineName: z.enum([ENGINES.ITGMania, ENGINES.DeadSync]).default(ENGINES.ITGMania),
  _engineVersion: z.string().optional(),
});

export type TimingDatum = z.infer<typeof TimingDatumSchema>;
export type Radar = z.infer<typeof RadarSchema>;
export type PlaySubmission = z.infer<typeof PlaySubmissionSchema>;

type TimingWindow = {
  name: string;
  maxOffset: number;
  weight: number;
};

export type ScoringSystem = {
  name: string;
  windows: TimingWindow[];
  heldWeight: number;
  missWeight: number;
  letGoWeight: number;
  mineHitWeight: number;
};

export type Grade = {
  scoringSystem?: ScoringSystem;
  minimumScore: number;
};

export type GradingSystem = {
  scoringSystem: ScoringSystem;
  grades: Record<string, Grade>;
  minimumPassGrade: string;
  failingGrade: string;
};

export const HARD_EX_SCORING_SYSTEM: ScoringSystem = {
  name: 'Hard EX',
  windows: [
    {
      name: 'Fantastic (10ms)',
      maxOffset: 0.01,
      weight: 3.5,
    },
    {
      name: 'Fantastic (23ms)',
      maxOffset: 0.023,
      weight: 3,
    },
    {
      name: 'Excellent',
      maxOffset: 0.0445,
      weight: 1,
    },
    {
      name: 'Great',
      maxOffset: 0.1035,
      weight: 0,
    },
    {
      name: 'Decent',
      maxOffset: 0.1365,
      weight: 0,
    },
    {
      name: 'Way Off',
      maxOffset: 0.1815,
      weight: 0,
    },
  ],
  heldWeight: 1,
  missWeight: 0,
  letGoWeight: 0,
  mineHitWeight: -1,
};

export const EX_SCORING_SYSTEM: ScoringSystem = {
  name: 'EX',
  windows: [
    {
      name: 'Fantastic (15ms)',
      maxOffset: 0.015,
      weight: 3.5,
    },
    {
      name: 'Fantastic (23ms)',
      maxOffset: 0.023,
      weight: 3,
    },
    {
      name: 'Excellent',
      maxOffset: 0.0445,
      weight: 2,
    },
    {
      name: 'Great',
      maxOffset: 0.1035,
      weight: 1,
    },
    {
      name: 'Decent',
      maxOffset: 0.1365,
      weight: 0,
    },
    {
      name: 'Way Off',
      maxOffset: 0.1815,
      weight: 0,
    },
  ],
  heldWeight: 1,
  missWeight: 0,
  letGoWeight: 0,
  mineHitWeight: -1,
};

export const MONEY_SCORING_SYSTEM: ScoringSystem = {
  name: 'ITG',
  windows: [
    {
      name: 'Fantastic (23ms)',
      maxOffset: 0.023,
      weight: 5,
    },
    {
      name: 'Excellent',
      maxOffset: 0.0445,
      weight: 4,
    },
    {
      name: 'Great',
      maxOffset: 0.1035,
      weight: 2,
    },
    {
      name: 'Decent',
      maxOffset: 0.1365,
      weight: 0,
    },
    {
      name: 'Way Off',
      maxOffset: 0.1815,
      weight: -6,
    },
  ],
  heldWeight: 5,
  missWeight: -12,
  letGoWeight: 0,
  mineHitWeight: -6,
};

export const ITG_GRADING_SYSTEM: GradingSystem = {
  scoringSystem: MONEY_SCORING_SYSTEM,
  minimumPassGrade: 'D',
  failingGrade: 'F',
  grades: {
    Quad: { minimumScore: 100 },
    Tristar: { minimumScore: 99 },
    Twostar: { minimumScore: 98 },
    Star: { minimumScore: 96 },
    'S+': { minimumScore: 94 },
    S: { minimumScore: 92 },
    'S-': { minimumScore: 89 },
    'A+': { minimumScore: 86 },
    A: { minimumScore: 83 },
    'A-': { minimumScore: 80 },
    'B+': { minimumScore: 76 },
    B: { minimumScore: 72 },
    'B-': { minimumScore: 68 },
    'C+': { minimumScore: 64 },
    C: { minimumScore: 60 },
    'C-': { minimumScore: 55 },
    D: { minimumScore: -Infinity }, // D is the lowest grade, so we use -Infinity to represent it
  },
};

export const EX_GRADING_SYSTEM: GradingSystem = {
  ...ITG_GRADING_SYSTEM,
  scoringSystem: MONEY_SCORING_SYSTEM,
  grades: {
    ...ITG_GRADING_SYSTEM.grades,
    Quint: { scoringSystem: EX_SCORING_SYSTEM, minimumScore: 100 },
  },
};

export const HARD_EX_GRADING_SYSTEM: GradingSystem = {
  ...ITG_GRADING_SYSTEM,
  scoringSystem: MONEY_SCORING_SYSTEM,
  grades: {
    ...EX_GRADING_SYSTEM.grades,
    Sex: { scoringSystem: HARD_EX_SCORING_SYSTEM, minimumScore: 100 },
  },
};

export class ScoringSystemHelper {
  private windows: TimingWindow[];
  public scoringSystem: ScoringSystem;
  public perfectWeight: number;

  constructor(scoringSystem: ScoringSystem) {
    this.scoringSystem = scoringSystem;
    // Sort the windows in case they aren't already sorted
    this.windows = [...scoringSystem.windows].sort((a, b) => a.maxOffset - b.maxOffset);
    this.perfectWeight = this.windows[0].weight;
  }

  getTapNoteWeight(offset: number | 'Miss'): number {
    if (offset === 'Miss') {
      return this.scoringSystem.missWeight;
    }

    const absOffset = Math.abs(offset);

    // Linear search - most offsets will be found in first few windows so anything
    // smarter isn't likely to actually help (may be detrimental, in fact)
    for (const window of this.windows) {
      if (absOffset <= window.maxOffset) {
        return window.weight;
      }
    }

    // If no window found, assume miss
    return this.scoringSystem.missWeight;
  }

  getWindow(offset: number | 'Miss'): TimingWindow {
    if (offset === 'Miss') {
      return { name: 'Miss', maxOffset: Infinity, weight: this.scoringSystem.missWeight };
    }

    const absOffset = Math.abs(offset);

    // Linear search - most offsets will be found in first few windows so anything
    // smarter isn't likely to actually help (may be detrimental, in fact)
    for (const window of this.windows) {
      if (absOffset <= window.maxOffset) {
        return window;
      }
    }

    // If no window found, assume miss
    return { name: 'Miss', maxOffset: Infinity, weight: this.scoringSystem.missWeight };
  }

  getJudgments(submission: PlaySubmission): Record<string, number> {
    const judgments: Record<string, number> = {};

    for (const window of this.windows) {
      judgments[window.name] = 0;
    }
    judgments['Miss'] = 0;

    const { timingData } = submission;

    for (const datum of timingData) {
      /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
      const [courseOffset, offset, arrowType, isStream, foot, early, earlyOffset, heldMiss] = datum;
      const window = this.getWindow(offset);

      if (!judgments[window.name]) {
        judgments[window.name] = 0;
      }
      judgments[window.name] += 1;
    }

    return judgments;
  }
}

interface Score {
  score: number;
  passed: boolean;
}

export class SubmissionCalculator {
  private scoringSystemHelpers: Record<string, ScoringSystemHelper>;
  private scoreCache: Record<string, Score>;
  private rawNoteData?: string;

  constructor(
    private submission: PlaySubmission,
    private prisma: PrismaClient,
  ) {
    this.scoringSystemHelpers = {
      [HARD_EX_SCORING_SYSTEM.name]: new ScoringSystemHelper(HARD_EX_SCORING_SYSTEM),
      [EX_SCORING_SYSTEM.name]: new ScoringSystemHelper(EX_SCORING_SYSTEM),
      [MONEY_SCORING_SYSTEM.name]: new ScoringSystemHelper(MONEY_SCORING_SYSTEM),
    };
    this.scoreCache = {};
  }

  async getRawNoteData(): Promise<string> {
    const chart = await this.prisma.chart.findFirst({
      where: {
        hash: this.submission.hash,
      },
      select: {
        noteData: true,
      },
    });

    if (!chart || !chart.noteData) {
      throw new Error('Chart data not found for submission hash, cannot compute score for a failure: ' + this.submission.hash);
    }

    return chart.noteData;
  }

  getJudgments(scoringSystem: ScoringSystem): Record<string, number> {
    const helper = this.scoringSystemHelpers[scoringSystem.name];
    if (!helper) {
      throw new Error(`Unknown scoring system: ${scoringSystem.name}`);
    }
    return helper.getJudgments(this.submission);
  }

  private calculateMaxScoreFallback(scoringSystem: ScoringSystem): number {
    if (!this.rawNoteData) {
      throw new Error('Raw note data is required to calculate max score fallback');
    }

    const counts = parseChartCounts(this.rawNoteData);
    const helper = this.scoringSystemHelpers[scoringSystem.name];
    if (!helper) {
      throw new Error(`Unknown scoring system: ${scoringSystem.name}`);
    }

    let maxScore = 0;
    maxScore += counts.taps * helper.perfectWeight;
    maxScore += counts.lifts * helper.perfectWeight;
    maxScore += counts.holds * scoringSystem.heldWeight;
    maxScore += counts.rolls * scoringSystem.heldWeight;
    // Mines do not contribute to max score in this calculation

    return maxScore;
  }

  async calculateScore(scoringSystem: ScoringSystem): Promise<Score> {
    if (this.scoreCache[scoringSystem.name]) {
      return this.scoreCache[scoringSystem.name];
    }

    let rawMaxScore = 0;

    if (!this.submission.passed && !this.rawNoteData) {
      // if the score hasn't been passed then the maximum points possible
      // can be reported incorrectly if we trust the submission payload
      // therefore fail calculation must be limited to only charts where
      // we have indexed the chart data and captured the raw note data
      // we will use the raw note data to determine the appropriate maximum
      // per scoring system during calculation
      this.rawNoteData = await this.getRawNoteData();
      rawMaxScore = this.calculateMaxScoreFallback(scoringSystem);
    }

    const helper = this.scoringSystemHelpers[scoringSystem.name];
    if (!helper) {
      throw new Error(`Unknown scoring system: ${scoringSystem.name}`);
    }

    const { timingData, lifebarInfo } = this.submission;
    let max = 0;
    let score = 0;
    let hasFailed = false;
    let failureTime: number | null = null;

    // If the submission failed, find the failure time from lifebar data
    if (!this.submission.passed && lifebarInfo.length > 0) {
      for (const point of lifebarInfo) {
        if (point.y <= 0) {
          failureTime = point.x;
          break;
        }
      }
    }

    for (const datum of timingData) {
      /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
      const [courseOffset, offset, arrowType, isStream, foot, early, earlyOffset, heldMiss] = datum;

      // Check if we've reached the failure point
      if (!this.submission.passed && failureTime !== null && courseOffset >= failureTime && !hasFailed) {
        hasFailed = true;
      }

      const weight = helper.getTapNoteWeight(offset);
      max += helper.perfectWeight;

      // Only add weight to score if we haven't failed yet
      if (!hasFailed) {
        score += weight;
      }
    }

    const [heldCount, totalHolds] = this.submission.radar.Holds;
    const [minesDodged, totalMines] = this.submission.radar.Mines;
    const [rollCount, totalRolls] = this.submission.radar.Rolls;

    max += totalHolds * helper.scoringSystem.heldWeight;
    max += totalRolls * helper.scoringSystem.heldWeight;

    score += heldCount * helper.scoringSystem.heldWeight;
    score += (totalMines - minesDodged) * helper.scoringSystem.mineHitWeight;
    score += rollCount * helper.scoringSystem.heldWeight;

    if (max === 0) {
      return {
        score: 0,
        passed: this.submission.passed,
      };
    }

    if (!this.submission.passed) {
      // For failed submissions, use the raw max score if available
      max = rawMaxScore;
    }

    this.scoreCache[scoringSystem.name] = {
      score: Math.max(Math.floor((score / max) * 100 * 100) / 100, 0),
      passed: this.submission.passed,
    };
    return this.scoreCache[scoringSystem.name];
  }

  async calculateGrade(gradingSystem: GradingSystem): Promise<string> {
    // First check if the submission was a passing play using the grading system's scoring system
    const score = await this.calculateScore(gradingSystem.scoringSystem);

    // If the play was not passed, return the failing grade
    if (!score.passed) {
      return gradingSystem.failingGrade;
    }

    // Build candidate grades by evaluating each grade against its scoring system
    // If the grade defines a scoringSystem override, use it; otherwise use the gradingSystem's default.
    type Candidate = {
      name: string;
      minimumScore: number;
      system: ScoringSystem;
      score: Score;
    };

    const entries = Object.entries(gradingSystem.grades);

    const scoreCache: { [key: string]: Score } = {};

    const candidates: Candidate[] = await Promise.all(
      entries.map(async ([name, grade]) => {
        const system = grade.scoringSystem ?? gradingSystem.scoringSystem;
        const systemScore = scoreCache[system.name] ?? (await this.calculateScore(system));
        scoreCache[system.name] = systemScore;
        return { name, minimumScore: grade.minimumScore, system, score: systemScore } as Candidate;
      }),
    );

    const filteredCandidates = candidates.filter((c) => c.score.score >= c.minimumScore);

    if (filteredCandidates.length === 0) {
      return gradingSystem.minimumPassGrade;
    }

    // Prefer higher thresholds first; when equal thresholds are met by multiple systems,
    // prefer more precise systems: Hard EX > EX > ITG (Money)
    const systemPriority = (system: ScoringSystem): number => {
      switch (system.name) {
        case 'Hard EX':
          return 3;
        case 'EX':
          return 2;
        case 'ITG':
          return 1;
        default:
          return 0;
      }
    };

    filteredCandidates.sort((a, b) => {
      if (b.minimumScore !== a.minimumScore) return b.minimumScore - a.minimumScore;
      const sp = systemPriority(b.system) - systemPriority(a.system);
      if (sp !== 0) return sp;
      // Stable fallback (no functional impact, but deterministic)
      return a.name.localeCompare(b.name);
    });

    return filteredCandidates[0].name;
  }
}

export function validatePlaySubmission(data: unknown): PlaySubmission {
  const result = PlaySubmissionSchema.parse(data);

  // for now enforcing an arbitrary limit of 1,000,000 tap notes for submissions
  // just to keep bad actors at bay
  // honestly though it's likely we just run out of memory before getting here
  if (result.timingData.length > 1000000) {
    throw new Error('Timing data exceeds maximum length of 1,000,000');
  }

  return result;
}
