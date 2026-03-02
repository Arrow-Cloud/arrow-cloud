import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient } from '../api/prisma/generated/client';
import { PlaySubmission, TimingDatum } from '../api/src/utils/scoring';

const prisma = new PrismaClient();
const s3Client: S3Client = new S3Client();
const BUCKET = 'arrow-cloud-mock-scores';

type DistributionType = 'uniform' | 'normal' | 'exponential';

/**
 * Returns a random number between -50 and 50 with configurable distribution
 * @param distribution - The type of distribution to use
 * @param params - Optional parameters for specific distributions
 */
function getRandomNumber(distribution: DistributionType = 'uniform', params?: { mean?: number; stdDev?: number; lambda?: number }): number {
  const min = -50;
  const max = 50;

  switch (distribution) {
    case 'uniform':
      return Math.random() * (max - min) + min;

    case 'normal': {
      const mean = params?.mean ?? 0;
      const stdDev = params?.stdDev ?? 15;

      // Box-Muller transformation for normal distribution
      const u = 1 - Math.random(); // Converting [0,1) to (0,1]
      const v = Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

      const value = z * stdDev + mean;
      return Math.max(min, Math.min(max, value)); // Clamp to range
    }

    case 'exponential': {
      const lambda = params?.lambda ?? 0.1;
      const u = Math.random();
      const value = -Math.log(1 - u) / lambda;

      // Map to -50 to 50 range with exponential decay from center
      const centered = Math.random() < 0.5 ? -value : value;
      return Math.max(min, Math.min(max, centered));
    }

    default:
      return Math.random() * (max - min) + min;
  }
}

const sample: PlaySubmission = {
  songName: 'It All Starts Right Now',
  artist: 'Mameyudoufu',
  pack: 'ZZ Theme Testing',
  length: '3:32',
  stepartist: '',
  difficulty: '1',
  hash: '1234567890abcdef',
  timingData: [
    [0.51419502496719, -0.016436278820038, 1, false, true, false, 0, false],
    [0.63943308591843, -0.0064115524291992, 2, false, false, false, 0, false],
    [0.76394557952881, -0.00078779458999634, 3, false, true, false, 0, false],
    [0.86240363121033, -0.018676400184631, 4, false, false, false, 0, false],
    [1.00727891922, 0.011104941368103, 1, false, true, false, 0, false],
    [1.4584354162216, -0.013960123062134, 2, false, false, false, 0, false],
    [1.8959864377975, -0.042710542678833, 3, false, true, false, 0, false],
    [2.3842403888702, -0.024394512176514, 4, false, false, false, 0, false],
  ],
  radar: {
    Holds: [4, 4],
    Mines: [0, 0],
    Rolls: [0, 0],
  },
  lifebarInfo: [
    { x: 0, y: 1 },
    { x: 0.5, y: 0.95 },
  ],
  npsInfo: {
    peakNPS: 8,
    points: [
      { x: 0, y: 0.2, nps: 2 },
      { x: 0.25, y: 0.4, nps: 4 },
      { x: 0.5, y: 0.5, nps: 5 },
      { x: 0.75, y: 0.7, nps: 7 },
    ],
  },
  modifiers: {
    visualDelay: 0,
    acceleration: [],
    appearance: [],
    effect: [],
    mini: 0,
    turn: 'None',
    disabledWindows: 'None',
    speed: {
      value: 775,
      type: 'C',
    },
    perspective: 'Overhead',
    noteskin: 'cel',
  },
  musicRate: 1,
  usedAutoplay: false,
  _arrowCloudBodyVersion: '1.1',
};

function generateRandomPlay(length: number): PlaySubmission {
  const play = {
    ...sample,
    timingData: Array.from({ length }).map((_, i) => {
      const time = (i + 1) * (length / 20);
      return [
        time,
        getRandomNumber('normal', { mean: 0, stdDev: 0.02 }), // Random offset
        (i % 4) + 1,
        false,
        false,
        false,
        0,
        false,
      ];
    }) as TimingDatum[],
    npsInfo: {
      peakNPS: 10,
      points: Array.from({ length: 10 }).map((_, idx) => ({ x: idx / 9, y: Math.random(), nps: 5 + Math.random() * 5 })),
    },
    lifebarInfo: Array.from({ length: 20 }).map((_, idx) => ({ x: idx / 19, y: 1 - Math.random() * 0.1 })),
  };
  return play;
}

// usage: npx tsx scripts/seed-plays.ts {chart_hash} {num_plays} {num_taps_per_play}
(async () => {
  // This script seeds the plays table with sample data for testing purposes.
  console.log('Seeding plays...');

  const chart_hash = process.argv[2];
  const num_plays = parseInt(process.argv[3], 10) || 1;
  const num_taps = parseInt(process.argv[4], 10) || 20;

  const userIds = (
    await prisma.user.findMany({
      select: { id: true },
    })
  ).map((user) => user.id);

  await prisma.chart.upsert({
    where: { hash: chart_hash },
    update: {},
    create: {
      hash: chart_hash,
      songName: sample.songName,
      artist: sample.artist,
      rating: typeof sample.difficulty === 'string' ? parseInt(sample.difficulty, 10) : sample.difficulty,
      length: sample.length,
      stepartist: sample.stepartist,
    },
  });

  await Promise.all(
    Array.from({ length: num_plays }).map(async (_, i) => {
      const userId = userIds[Math.floor(Math.random() * userIds.length)];
      const play = generateRandomPlay(num_taps);
      console.log(play);

      // save score submission json to s3
      const path = `scores/${chart_hash}/${userId}/${Date.now()}-${i}.json`;
      try {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: path,
            Body: JSON.stringify(play),
            ContentType: 'application/json',
          }),
        );
      } catch (error) {
        console.error('Failed to upload score submission to S3:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to upload score submission to S3' }),
        };
      }

      // save play with link to s3 file
      try {
        await prisma.play.create({
          data: {
            userId: userId,
            chartHash: chart_hash,
            rawTimingDataUrl: `s3://${BUCKET}/${path}`,
            modifiers: play.modifiers as object,
          },
        });
      } catch (error) {
        console.error('Failed to create play record:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to create play record' }),
        };
      }
    }),
  );
})();
