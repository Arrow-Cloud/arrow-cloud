import { PrismaClient, Play } from '../../prisma/generated/client';
import { S3Client } from '@aws-sdk/client-s3';
import {
  EXLeaderboard,
  ITGLeaderboard,
  HardEXLeaderboard,
  GLOBAL_HARD_EX_LEADERBOARD_ID,
  GLOBAL_EX_LEADERBOARD_ID,
  GLOBAL_MONEY_LEADERBOARD_ID,
} from './leaderboard';
import { loadTimingDataFromPlay } from './s3';
import {
  EX_GRADING_SYSTEM,
  EX_SCORING_SYSTEM,
  ITG_GRADING_SYSTEM,
  MONEY_SCORING_SYSTEM,
  PlaySubmission,
  HARD_EX_GRADING_SYSTEM,
  HARD_EX_SCORING_SYSTEM,
  SubmissionCalculator,
} from './scoring';

// Shared epoch base (must match leaderboard index logic) for tie-break inversion
const INVERT_EPOCH_BASE = Date.UTC(2500, 0, 1, 0, 0, 0, 0);
function buildTieBreakComponent(date: Date): string {
  const inverted = INVERT_EPOCH_BASE - date.getTime();
  return inverted.toString().padStart(13, '0');
}

/**
 * Process a single play and create leaderboard entries
 * Assumes that the play has not been processed yet (it is the caller's responsiblity to clean up previous entries)
 */
export async function processSinglePlay(play: Play, prisma: PrismaClient, s3Client: S3Client, submission?: PlaySubmission): Promise<void> {
  console.log(`Processing play ${play.id} for user ${play.userId} on chart ${play.chartHash}`);

  // Fetch timing data
  if (!play.rawTimingDataUrl) {
    console.log('No timing data URL found for this play, skipping...');
    return;
  }

  console.log('Fetching timing data...');
  const timingData = submission ? submission : await loadTimingDataFromPlay(play, s3Client);

  if (!timingData) {
    console.log('No timing data found for this play, skipping...');
    return;
  }

  // Pre-compute scores, grades, and judgments for all scoring systems
  const calculator = new SubmissionCalculator(timingData, prisma);

  const [hardExScore, exScore, moneyScore] = await Promise.all([
    calculator.calculateScore(HARD_EX_SCORING_SYSTEM),
    calculator.calculateScore(EX_SCORING_SYSTEM),
    calculator.calculateScore(MONEY_SCORING_SYSTEM),
  ]);

  const [hardExGrade, exGrade, moneyGrade] = await Promise.all([
    calculator.calculateGrade(HARD_EX_GRADING_SYSTEM),
    calculator.calculateGrade(EX_GRADING_SYSTEM),
    calculator.calculateGrade(ITG_GRADING_SYSTEM),
  ]);
  const hardExJudgments = calculator.getJudgments(HARD_EX_SCORING_SYSTEM);
  const exJudgments = calculator.getJudgments(EX_SCORING_SYSTEM);
  const moneyJudgments = calculator.getJudgments(MONEY_SCORING_SYSTEM);

  // Get radar data (same for all leaderboards)
  const [heldCount, totalHolds] = timingData.radar.Holds;
  const [minesDodged, totalMines] = timingData.radar.Mines;
  const [rollCount, totalRolls] = timingData.radar.Rolls;
  const radarData = {
    holdsHeld: heldCount,
    holdsTotal: totalHolds,
    minesDodged,
    minesTotal: totalMines,
    rollsHit: rollCount,
    rollsTotal: totalRolls,
  };

  const toProcess = [
    {
      system: new HardEXLeaderboard(play, timingData, HARD_EX_SCORING_SYSTEM, HARD_EX_GRADING_SYSTEM, prisma, calculator),
      leaderboardId: GLOBAL_HARD_EX_LEADERBOARD_ID,
      precomputedData: {
        score: hardExScore.score.toFixed(2),
        grade: hardExGrade,
        judgments: hardExJudgments,
        radar: radarData,
      },
      sortKey:
        hardExScore.score.toFixed(2).replace('.', '').padStart(5, '0') + '-' + buildTieBreakComponent(play.createdAt) + '-' + play.createdAt.toISOString(),
    },
    {
      system: new EXLeaderboard(play, timingData, EX_SCORING_SYSTEM, EX_GRADING_SYSTEM, prisma, calculator),
      leaderboardId: GLOBAL_EX_LEADERBOARD_ID,
      precomputedData: {
        score: exScore.score.toFixed(2),
        grade: exGrade,
        judgments: exJudgments,
        radar: radarData,
      },
      sortKey: exScore.score.toFixed(2).replace('.', '').padStart(5, '0') + '-' + buildTieBreakComponent(play.createdAt) + '-' + play.createdAt.toISOString(),
    },
    {
      system: new ITGLeaderboard(play, timingData, MONEY_SCORING_SYSTEM, ITG_GRADING_SYSTEM, prisma, calculator),
      leaderboardId: GLOBAL_MONEY_LEADERBOARD_ID,
      precomputedData: {
        score: moneyScore.score.toFixed(2),
        grade: moneyGrade,
        judgments: moneyJudgments,
        radar: radarData,
      },
      sortKey:
        moneyScore.score.toFixed(2).replace('.', '').padStart(5, '0') + '-' + buildTieBreakComponent(play.createdAt) + '-' + play.createdAt.toISOString(),
    },
  ];

  // Process all leaderboards and collect entries to upsert
  const entriesToCreate: Array<{
    playId: number;
    leaderboardId: number;
    data: any;
    sortKey: string;
  }> = [];

  for (const l of toProcess) {
    const { system, leaderboardId, precomputedData, sortKey } = l;

    if (!system.isEligible()) {
      console.log(`Play is not eligible for leaderboard ${system.getName()}, skipping...`);
      continue;
    }

    console.log(`Play is eligible for leaderboard ${system.getName()}`);
    console.log(`${system.getName()}: ${sortKey}`, precomputedData);

    entriesToCreate.push({
      playId: play.id,
      leaderboardId,
      data: precomputedData,
      sortKey,
    });
  }

  // Batch create all leaderboard entries
  if (entriesToCreate.length > 0) {
    console.log(`Creating ${entriesToCreate.length} leaderboard entries...`);

    // Then bulk insert all new entries
    await prisma.playLeaderboard.createMany({
      data: entriesToCreate,
    });
  }

  console.log(`Successfully processed play ${play.id}`);
}
