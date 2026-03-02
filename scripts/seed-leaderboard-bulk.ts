import { PrismaClient } from '../api/prisma/generated/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'node:crypto';
import { SubmissionCalculator, PlaySubmission, HARD_EX_SCORING_SYSTEM, EX_SCORING_SYSTEM, MONEY_SCORING_SYSTEM } from '../api/src/utils/scoring';
import { processSinglePlay } from '../api/src/utils/play-processor';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();
const s3 = new S3Client();

// Where to stash synthetic submissions
const SCORES_BUCKET = process.env.SEED_SCORES_BUCKET || 'arrow-cloud-mock-scores';

// Default chart hash from request
const DEFAULT_CHART_HASH = 'd8add468b7466170';

// Leaderboard IDs used by the processor
const LB_HARD_EX_ID = 4; // GLOBAL_SUPER_EX_LEADERBOARD_ID
const LB_EX_ID = 2; // GLOBAL_EX_LEADERBOARD_ID
const LB_ITG_ID = 3; // GLOBAL_MONEY_LEADERBOARD_ID

// How many users and plays per user
const DEFAULT_USER_COUNT = 250;
const DEFAULT_PLAYS_PER_USER = 3; // multiple per user to test dedupe, best-of logic

// Example submission skeleton from attachment, adapted to our types
const baseSubmission: Omit<PlaySubmission, 'timingData'> & { timingData: any[] } = {
  songName: '[1001] [07] If U Need It (Hard)',
  artist: 'Sammy Virji',
  pack: 'ITL Online 2025',
  length: '1:58',
  hash: DEFAULT_CHART_HASH,
  timingData: [],
  radar: { Holds: [0, 38], Mines: [0, 0], Rolls: [0, 0] },
  difficulty: 7,
  stepartist: 'Ritz',
  lifebarInfo: [{ x: 0, y: 1 }],
  npsInfo: { peakNPS: 0, points: [{ x: 0, y: 0 }] },
  modifiers: {
    visualDelay: 0,
    acceleration: [],
    appearance: [],
    effect: [],
    mini: 35,
    turn: 'None',
    disabledWindows: 'None',
    speed: { value: 775, type: 'C' },
    perspective: 'Overhead',
    noteskin: 'cel',
  },
  musicRate: 1,
  usedAutoplay: false,
  passed: true,
  _arrowCloudBodyVersion: '1.0',
};

// Offsets tuned for very high scores:
// - 98% within 3ms
// - 1% between 10–15ms
// - 0.7% between 15–23ms
// - 0.3% between 23–44.5ms
// No misses.
function randomOffset(): number {
  const r = Math.random();
  const sign = Math.random() < 0.5 ? -1 : 1;
  const pick = (min: number, max: number) => sign * (min + Math.random() * (max - min));

  if (r < 0.98) {
    // Extremely tight grouping around 0, clamp to ±3ms
    return clampNormal(0, 0.0012, -0.003, 0.003);
  } else if (r < 0.99) {
    // Slight mistakes between 10–15ms
    return pick(0.0101, 0.015);
  } else if (r < 0.997) {
    // A few in the 15–23ms range
    return pick(0.0151, 0.023);
  }
  // Rare larger errors up to Excellent window (~44.5ms)
  return pick(0.0231, 0.0445);
}

function clampNormal(mean: number, std: number, min: number, max: number): number {
  // Box-Muller
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const value = z0 * std + mean;
  return Math.max(min, Math.min(max, value));
}

function generateSubmission(times: number[], arrows: number[], seedShift = 0): PlaySubmission {
  const timingData: PlaySubmission['timingData'] = times.map((time, i) => {
    const offset = randomOffset();
    // Use example's arrow lane if available; fallback to cyclic
    const laneRaw = (arrows && arrows[i]) || ((i + seedShift) % 4) + 1;
    const arrow = (laneRaw === 1 || laneRaw === 2 || laneRaw === 3 || laneRaw === 4 ? laneRaw : ((i + seedShift) % 4) + 1) as 1 | 2 | 3 | 4;
    const early = offset < 0;
    return [time, offset, arrow, false, false, early, 0, false];
  });
  // Ensure holds are fully held to avoid depressing scores artificially
  const totalHolds = baseSubmission.radar.Holds[1] || 0;
  const radar = {
    ...baseSubmission.radar,
    Holds: [totalHolds, totalHolds] as [number, number],
  };
  return { ...baseSubmission, radar, timingData } as PlaySubmission;
}

async function ensureChart(hash: string) {
  await prisma.chart.upsert({
    where: { hash },
    update: {},
    create: {
      hash,
      songName: baseSubmission.songName,
      artist: baseSubmission.artist,
      rating: typeof baseSubmission.difficulty === 'string' ? parseInt(baseSubmission.difficulty, 10) : baseSubmission.difficulty,
      length: baseSubmission.length,
      stepartist: baseSubmission.stepartist,
    },
  });
}

async function ensureLeaderboards() {
  const entries = [
    { id: LB_EX_ID, type: 'EX' },
    { id: LB_ITG_ID, type: 'ITG' },
    { id: LB_HARD_EX_ID, type: 'HardEX' },
  ];
  for (const lb of entries) {
    await prisma.leaderboard.upsert({
      where: { id: lb.id },
      update: { type: lb.type },
      create: { id: lb.id, type: lb.type },
    });
  }
}

async function upsertUsers(count: number): Promise<{ id: string; alias: string }[]> {
  const users: { id: string; alias: string }[] = [];
  for (let i = 0; i < count; i++) {
    const alias = `seed_user_${(i + 1).toString().padStart(3, '0')}`;
    const email = `${alias}@example.com`;
    const user = await prisma.user.upsert({
      where: { alias },
      update: {},
      create: { alias, email },
      select: { id: true, alias: true },
    });
    users.push(user);
  }
  return users;
}

async function uploadSubmissionToS3(userId: string, chartHash: string, submission: PlaySubmission): Promise<string> {
  const key = `scores/${chartHash}/${userId}/${Date.now()}-${randomBytes(3).toString('hex')}.json`;
  await s3.send(
    new PutObjectCommand({
      Bucket: SCORES_BUCKET,
      Key: key,
      Body: JSON.stringify(submission),
      ContentType: 'application/json',
    }),
  );
  return `s3://${SCORES_BUCKET}/${key}`;
}

async function createPlay(userId: string, chartHash: string, submission: PlaySubmission) {
  const rawTimingDataUrl = await uploadSubmissionToS3(userId, chartHash, submission);
  const play = await prisma.play.create({
    data: {
      userId,
      chartHash,
      rawTimingDataUrl,
      modifiers: submission.modifiers as object,
    },
  });
  return play;
}

async function describeScores(submission: PlaySubmission) {
  const calc = new SubmissionCalculator(submission, prisma);
  const [hardEx, ex, itg] = await Promise.all([
    calc.calculateScore(HARD_EX_SCORING_SYSTEM),
    calc.calculateScore(EX_SCORING_SYSTEM),
    calc.calculateScore(MONEY_SCORING_SYSTEM),
  ]);
  return { hardEx, ex, itg };
}

async function main() {
  // This script is scoped to a single chart and derives tap count from the provided example file
  const chartHash = DEFAULT_CHART_HASH;
  const userCount = parseInt(process.argv[2] || '', 10) || DEFAULT_USER_COUNT;
  const playsPerUser = parseInt(process.argv[3] || '', 10) || DEFAULT_PLAYS_PER_USER;

  // Read example submission to determine exact tap count
  const examplePath = path.resolve(__dirname, './examples/usemylove.json');
  const exampleRaw = await readFile(examplePath, 'utf-8');
  const example = JSON.parse(exampleRaw);
  if (!example?.timingData || !Array.isArray(example.timingData)) {
    throw new Error(`examples/usemylove.json missing timingData array`);
  }
  const taps = example.timingData.length;
  // Extract exact tap times and lanes from the example to strictly respect structure
  const exampleTimes: number[] = example.timingData.map((d: any[]) => d[0]);
  const exampleArrows: number[] = example.timingData.map((d: any[]) => d[2]);

  console.log(`Seeding users (${userCount}) and plays (${playsPerUser} each) for chart ${chartHash} with ${taps} taps from example`);

  await ensureChart(chartHash);
  await ensureLeaderboards();

  const users = await upsertUsers(userCount);

  // Instrumentation: track generated offset distribution across buckets
  let totalTaps = 0;
  let within5 = 0;
  let between5_10 = 0;
  let between10_15 = 0;
  let between15_23 = 0;
  let between23_445 = 0;

  let createdPlays = 0;
  for (const [idx, user] of users.entries()) {
    for (let p = 0; p < playsPerUser; p++) {
      const submission = generateSubmission(exampleTimes, exampleArrows, idx + p);
      // Update distribution metrics
      for (const d of submission.timingData) {
        const off = Math.abs(d[1] as number);
        totalTaps++;
        if (off <= 0.005) within5++;
        else if (off <= 0.01) between5_10++;
        else if (off <= 0.015) between10_15++;
        else if (off <= 0.023) between15_23++;
        else if (off <= 0.0445) between23_445++;
      }
      const scores = await describeScores(submission);

      const play = await createPlay(user.id, chartHash, submission);

      // Process into leaderboard entries (uses existing pipeline and sortKey formatting)
      await processSinglePlay(play, prisma, s3, submission);

      createdPlays++;
      if (createdPlays % 50 === 0) {
        console.log(`Created ${createdPlays} plays... last scores:`, {
          user: user.alias,
          hardEx: scores.hardEx.score.toFixed(2),
          ex: scores.ex.score.toFixed(2),
          itg: scores.itg.score.toFixed(2),
        });
      }
    }
  }

  console.log(`Done. Created ${createdPlays} plays for ${users.length} users.`);

  // Print distribution summary
  if (totalTaps > 0) {
    const pct = (n: number) => ((n / totalTaps) * 100).toFixed(2) + '%';
    console.log('Offset distribution (by magnitude):');
    console.table({
      totalTaps,
      within_0_5ms: `${within5} (${pct(within5)})`,
      between_5_10ms: `${between5_10} (${pct(between5_10)})`,
      between_10_15ms: `${between10_15} (${pct(between10_15)})`,
      between_15_23ms: `${between15_23} (${pct(between15_23)})`,
      between_23_44_5ms: `${between23_445} (${pct(between23_445)})`,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
