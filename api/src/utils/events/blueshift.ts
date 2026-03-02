import { ALLOWED_AUTOPLAY_USERS, BaseLeaderboard, ILeaderboard } from '../leaderboard';
import { z } from 'zod';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { PrismaClient } from '../../../prisma/generated/client';
import { assetS3UrlToCloudFrontUrl, toCfVariantSet } from '../s3';
import pLimit from 'p-limit';
import { BaseEventConfig, LeaderboardEntry as BaseLeaderboardEntry } from './base';

export const BETA_HASHES = [
  '0092bb246527b2ec',
  '0e5cab697ead613d',
  '18619fb839a9e870',
  '22525fba3b427622',
  '2ec80c43ac87d8b8',
  '3a88fb44a757c557',
  '4817b774753dbab3',
  '5d6751d544fdabe4',
  '6155e06fb6da873f',
  '7625732c22937630',
  '7fab40f16146f5e1',
  '805613ff5f116eb0',
  '864fb27e9ef47cf5',
  '8f7d7965dd75afdd',
  'a1212857b3d6c716',
  'b1f55deaefeae52b',
  'b3dc5ee840d033c9',
  'b4d5cef4d709b8cc',
  'b58c76dd53f562df',
  'b79d7ef817ec35d2',
  'c959f3f8c2cbd4af',
  'ea1304a3c8c688a6',
  'ecf9050d7f685319',
];

export const PHASE_1_HASHES = [
  '63101ea40e1a2838',
  '55b1f5908313e8f7',
  '1734babbf57001b6',
  '17a72b694400847e',
  'a72ca72c1915692d',
  'de903492a8341699',
  '0ad686033ae7423d',
  'f9fd8685f25264a6',
  'facba50ede050e5f',
  '47a4f12d6c8406f7',
  '6696a40da7e0bb1d',
  'e9dd5d4fd1c27612',
  'ca76bc30b53309d9',
  '5b5b204347108eb7',
  'ea323cfbb64ef3ee',
  '7209bd5ea52c3ae2',
  '8406f896cdd0bee4',
  '0ae588e08c8a4cd6',
  'd535504d2c93d715',
  '1ee2fcf12a85a3da',
  '970f4177df2261ca',
  '3b18148cff6faa1b',
  '212a71f4eb1f8409',
  'e60c19fd8cde7698',
  'c727ce3b79c43e49',
];

export const PHASE_2_HASHES: string[] = [
  '3df09167054eafb2',
  'a6b6d6573da449d8',
  'bbc20cc985ba42fc',
  '41240d8448aa403e',
  '2d81ea9d17a4cb31',
  '2b6fa1a4f2ffc4a4',
  'c1386f2fc75d4fec',
  'c76c828d3aa0878d',
  'c8f653ca09a1f751',
  '56a546f6d4c49d67',
  'bd442c2b23a9fc21',
  '9b7ac0593a3ac302',
  '2cc79e89f38a14f7',
  '3eb5dd158e40f53b',
  'ca998d3f402d572e',
  'ab3970a8da8baf98',
  'b9dd52836760d240',
  'ab76a0f8534425ff',
  '73d41c1ec11d9a7c',
  '332de2011f97b8e4',
  '53e2c23f26021510',
  '1af8eeb20b85a624',
  '0c1e62e2badc427f',
  '997ad5dc07effa97',
  'bd203fa0cac24c50',
];

export const PHASE_3_HASHES: string[] = [
  'f1aabb381fb4d3fe',
  '16821ecb46d58473',
  '0a71cc2d271ac82f',
  '0dcfd57573049d09',
  '95fc74dd1869b689',
  '83ca402034c6f047',
  'abd8ef65089dba49',
  '3c4f0b48fbd3dba2',
  'ddb69b8b47235414',
  'da43a7ff089c7a6b',
  'bee74a09c8113470',
  'e885ffdde2e203ee',
  '8e5b5802e7bb39b7',
  '66bb2314dbd72a94',
  '65bbbd561b00b50a',
];

// Beta event dates (kept for backwards compatibility)
export const BLUE_SHIFT_BETA_START_DATE = new Date('2025-10-12T00:00:00Z');
export const BLUE_SHIFT_BETA_END_DATE = new Date('2025-11-24T00:00:00Z');

// Phase 1: December 5, 2025 12PM UTC - December 26, 2025 12PM UTC (3 weeks)
export const BLUE_SHIFT_PHASE_1_START_DATE = new Date('2025-12-05T12:00:00Z');
export const BLUE_SHIFT_PHASE_1_END_DATE = new Date('2025-12-26T12:00:00Z');

// Phase 2: December 26, 2025 12PM UTC - January 16, 2026 12PM UTC (3 weeks)
export const BLUE_SHIFT_PHASE_2_START_DATE = new Date('2025-12-26T12:00:00Z');
export const BLUE_SHIFT_PHASE_2_END_DATE = new Date('2026-01-16T12:00:00Z');

// Phase 3: January 16, 2026 12PM UTC - February 6, 2026 12PM UTC (3 weeks)
export const BLUE_SHIFT_PHASE_3_START_DATE = new Date('2026-01-16T12:00:00Z');
export const BLUE_SHIFT_PHASE_3_END_DATE = new Date('2026-02-06T12:00:00Z');

// Download URLs for each phase
export const BLUE_SHIFT_PHASE_1_DOWNLOAD_URL = 'https://drive.google.com/file/d/11xpf2QQcxhTEPTjT4p9zkZfnDEDUonon/view?usp=sharing';
export const BLUE_SHIFT_PHASE_2_DOWNLOAD_URL = 'https://drive.google.com/file/d/1Y_KNrSbpUWbsWOXyPPwwibr8_i-XK10n/view?usp=sharing';
export const BLUE_SHIFT_PHASE_3_DOWNLOAD_URL = 'https://drive.google.com/file/d/1hEgU8EBWpl5FJ3nKeOw-bqLcqG2HZQO-/view?usp=sharing';

/**
 * Get the currently active Blue Shift phase (1, 2, or 3)
 * Defaults to Phase 1 for preview/testing when no phase is active
 */
export function getActiveBlueShiftPhase(now: Date = new Date()): 1 | 2 | 3 {
  if (now >= BLUE_SHIFT_PHASE_1_START_DATE && now <= BLUE_SHIFT_PHASE_1_END_DATE) return 1;
  if (now >= BLUE_SHIFT_PHASE_2_START_DATE && now <= BLUE_SHIFT_PHASE_2_END_DATE) return 2;
  if (now >= BLUE_SHIFT_PHASE_3_START_DATE && now <= BLUE_SHIFT_PHASE_3_END_DATE) return 3;
  // Default to Phase 1 for preview/testing when no phase is active
  return 1;
}

/**
 * Get the download URL for the active Blue Shift phase
 */
export function getBlueShiftPackDownloadUrl(phase: 1 | 2 | 3 = getActiveBlueShiftPhase()): string {
  switch (phase) {
    case 1:
      return BLUE_SHIFT_PHASE_1_DOWNLOAD_URL;
    case 2:
      return BLUE_SHIFT_PHASE_2_DOWNLOAD_URL;
    case 3:
      return BLUE_SHIFT_PHASE_3_DOWNLOAD_URL;
  }
}

// Test user ID that bypasses timing restrictions
export const BLUE_SHIFT_TEST_USER_IDS = ['3ac37479-c87f-459c-b3aa-c17e95c1a0d8', 'f7e9cf36-cbc8-4330-9389-292b4034c043'];

// Beta leaderboards
export const BLUE_SHIFT_HARD_EX_LEADERBOARD_ID = 5;
export const BLUE_SHIFT_EX_LEADERBOARD_ID = 6;
export const BLUE_SHIFT_MONEY_LEADERBOARD_ID = 7;

// Phase 1 leaderboards
export const BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID = 8;
export const BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID = 9;
export const BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID = 10;

// Phase 2 leaderboards
export const BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID = 12;
export const BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID = 13;
export const BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID = 14;

// Phase 3 leaderboards
export const BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID = 15;
export const BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID = 16;
export const BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID = 17;

export const LeaderboardEntrySchema = z.object({
  rank: z.bigint().transform((val) => Number(val)),
  data: z.any(), // JSON data from the leaderboard
  userAlias: z.string(),
  userId: z.string(),
  userProfileImageUrl: z.string().nullable(),
  chartHash: z.string(),
  leaderboardType: z.string(),
  sortKey: z.union([z.string(), z.number(), z.bigint()]).transform((val) => val.toString()),
});

export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

export interface UserChartScore {
  userAlias: string;
  userId: string;
  userProfileImageUrl: string | null;
  chartHash: string;
  leaderboardType: string;
  rank: number;
  points: number;
}

export interface UserOverallScore {
  userAlias: string;
  userId: string;
  userProfileImageUrl: string | null;
  totalPoints: number;
  chartScores: UserChartScore[];
}

// for user event profiles
interface UserLeaderboard {
  rank: number;
  totalPoints: number;
  chartsPlayed: number;
  chartScores: (Pick<UserChartScore, 'chartHash' | 'rank' | 'points'> & { chart: ChartData | null })[];
}
export interface UserLeaderboards {
  userAlias: string;
  userId: string;
  userProfileImageUrl: string | null;
  leaderboards: {
    [key: string]: UserLeaderboard;
  };
}

// for home page leaderboard
export interface CombinedLeaderboards {
  generatedAt: string;
  pointsSystem: {
    maxPoints: number;
    decayRate?: number;
    system?: string;
    description: string;
  };
  leaderboards: {
    [key: string]: {
      rankings: {
        rank: number;
        userAlias: string;
        userId: string;
        userProfileImageUrl: string | null;
        totalPoints: number;
        chartsPlayed: number;
      }[];
    };
  };
}

/**
 * Calculate points based on leaderboard position using exponential decay
 * @param rank The 1-based rank (1st place, 2nd place, etc.)
 * @param maxPoints Maximum points for first place (default: 10000)
 * @param decayRate How quickly points decrease (default: 0.08, smaller = slower decay)
 * @returns Points for this rank
 */
export function calculatePointsForRank(rank: number, maxPoints: number = 10000, decayRate: number = 0.08): number {
  if (rank <= 0) return 0;

  // Exponential decay formula: maxPoints * e^(-decayRate * (rank - 1))
  const points = maxPoints * Math.exp(-decayRate * (rank - 1));

  // Round to nearest integer and ensure minimum of 1 point for any valid rank
  return Math.max(1, Math.round(points));
}

/**
 * Calculate points using stepped conservative decay (used in Phase 2 & 3)
 * Gentle decay at top (ranks 1-10), moderate mid-range (11-30), slow tail (31+)
 * @param rank The 1-based rank (1st place, 2nd place, etc.)
 * @returns Points for this rank
 */
export function calculatePointsForRankSteppedConservative(rank: number): number {
  if (rank <= 0) return 0;

  const maxPoints = 10000;

  // Ranks 1-10: Gentle decay at very top
  if (rank <= 10) {
    const decayRate = 0.06;
    const points = maxPoints * Math.exp(-decayRate * (rank - 1));
    return Math.max(1, Math.round(points));
  }

  // Ranks 11-30: Moderate decay
  if (rank <= 30) {
    const rank10Points = maxPoints * Math.exp(-0.06 * 9);
    const decayRate = 0.055;
    const points = rank10Points * Math.exp(-decayRate * (rank - 10));
    return Math.max(1, Math.round(points));
  }

  // Ranks 31+: Slow logarithmic tail
  const rank30Points = maxPoints * Math.exp(-0.06 * 9) * Math.exp(-0.055 * 20);
  const logPoints = rank30Points * (1 / (1 + 0.02 * (rank - 30)));
  return Math.max(1, Math.round(logPoints));
}

interface ChartData {
  hash: string;
  songName: string | null;
  artist: string | null;
  stepsType: string | null;
  difficulty: string | null;
  meter: number | null;
  bannerUrl: string | null;
  bannerVariants?: any | null; // todo: better type
  smBannerUrl?: string | null;
  mdBannerUrl?: string | null;
}

export async function getChartData(prisma: PrismaClient, chartHashes?: string[]): Promise<{ [chartHash: string]: ChartData }> {
  // Default to all Blue Shift hashes if not specified
  const hashes = chartHashes || [...BETA_HASHES, ...PHASE_1_HASHES, ...PHASE_2_HASHES, ...PHASE_3_HASHES];

  const chartData = await prisma.chart.findMany({
    where: {
      hash: {
        in: hashes,
      },
    },
    select: {
      hash: true,
      songName: true,
      artist: true,
      stepsType: true,
      difficulty: true,
      meter: true,
      simfiles: {
        select: {
          simfile: {
            select: {
              bannerUrl: true,
              bannerVariants: true,
              smBannerUrl: true,
              mdBannerUrl: true,
              pack: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return Object.fromEntries(
    chartData.map((chart) => {
      // Prioritize simfiles from Blue Shift Phase packs for banner
      const blueShiftSimfile = chart.simfiles.find(
        (sf) => sf.simfile.pack.name.startsWith('Blue Shift Phase') && (sf.simfile.bannerUrl || sf.simfile.bannerVariants || sf.simfile.mdBannerUrl),
      );
      // Fall back to any simfile with a banner
      const simfileWithBanner = blueShiftSimfile || chart.simfiles.find((sf) => sf.simfile.bannerUrl || sf.simfile.bannerVariants || sf.simfile.mdBannerUrl);
      // Finally fall back to first simfile
      const simfile = simfileWithBanner?.simfile || chart.simfiles[0]?.simfile;

      return [
        chart.hash,
        {
          hash: chart.hash,
          songName: chart.songName,
          artist: chart.artist,
          stepsType: chart.stepsType,
          difficulty: chart.difficulty,
          meter: chart.meter,
          bannerUrl: simfile?.bannerUrl ? assetS3UrlToCloudFrontUrl(simfile.bannerUrl) : null,
          bannerVariants: toCfVariantSet(simfile?.bannerVariants) || null,
          smBannerUrl: simfile?.smBannerUrl ? assetS3UrlToCloudFrontUrl(simfile.smBannerUrl) : null,
          mdBannerUrl: simfile?.mdBannerUrl ? assetS3UrlToCloudFrontUrl(simfile.mdBannerUrl) : null,
        },
      ];
    }),
  );
}

/**
 * Get leaderboard entries for a set of chart hashes and leaderboard IDs
 * This is a common utility used by all Blue Shift event phases
 */
async function getLeaderboardEntriesForHashes(
  prisma: PrismaClient,
  chartHashes: string[],
  leaderboardIds: number[],
  singleChartHash?: string,
): Promise<BaseLeaderboardEntry[]> {
  // If a single chart is requested, only query that chart instead of all event charts
  const hashesToQuery = singleChartHash ? [singleChartHash] : chartHashes;

  const rawResults = await prisma.$queryRaw`
    WITH best_scores AS (
      SELECT DISTINCT ON (p."chartHash", l.type, u.alias)
        pl.data,
        u.alias as "userAlias",
        u.id as "userId",
        u."profileImageUrl" as "userProfileImageUrl",
        p."chartHash",
        l.type as "leaderboardType",
        pl."sortKey",
        (pl.data->>'score')::decimal as score
      FROM "PlayLeaderboard" pl
      JOIN "Play" p ON pl."playId" = p.id
      JOIN "User" u ON p."userId" = u.id
      JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
      WHERE p."chartHash" = ANY(${hashesToQuery})
        AND l.id = ANY(${leaderboardIds})
      ORDER BY p."chartHash", l.type, u.alias, pl."sortKey" DESC
    )
    SELECT
      RANK() OVER (
        PARTITION BY "chartHash", "leaderboardType" 
        ORDER BY score DESC
      ) as rank,
      data,
      "userAlias",
      "userId",
      "userProfileImageUrl",
      "chartHash",
      "leaderboardType",
      "sortKey"
    FROM best_scores
    ORDER BY "chartHash", "leaderboardType", score DESC
  `;

  return z.array(LeaderboardEntrySchema).parse(rawResults) as BaseLeaderboardEntry[];
}

/**
 * Get all leaderboard entries for Blue Shift event charts
 */
export async function getBlueShiftLeaderboardEntries(prisma: PrismaClient): Promise<LeaderboardEntry[]> {
  const leaderboardIds = [BLUE_SHIFT_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_EX_LEADERBOARD_ID, BLUE_SHIFT_MONEY_LEADERBOARD_ID];

  console.log('Fetching leaderboard entries for Blue Shift event...');
  const entries = await getLeaderboardEntriesForHashes(prisma, BETA_HASHES, leaderboardIds);
  console.log(`Found ${entries.length} leaderboard entries`);

  return entries as LeaderboardEntry[];
}

export function calculateLeaderboards(
  entries: LeaderboardEntry[],
  pointCalculator: (rank: number) => number = calculatePointsForRank,
): Map<string, UserOverallScore[]> {
  const leaderboardsByType = new Map<string, UserOverallScore[]>();

  // Group entries by leaderboard type
  const entriesByType = new Map<string, LeaderboardEntry[]>();
  entries.forEach((entry) => {
    if (!entriesByType.has(entry.leaderboardType)) {
      entriesByType.set(entry.leaderboardType, []);
    }
    entriesByType.get(entry.leaderboardType)!.push(entry);
  });

  // Calculate leaderboard for each type
  entriesByType.forEach((typeEntries, leaderboardType) => {
    console.log(`Calculating ${leaderboardType} leaderboard...`);

    const userScoresMap = new Map<string, UserOverallScore>();

    // Group entries by chart hash and sort key to identify ties
    const chartScoreGroups = new Map<string, Map<string, LeaderboardEntry[]>>();

    for (const entry of typeEntries) {
      const key = entry.chartHash;
      if (!chartScoreGroups.has(key)) {
        chartScoreGroups.set(key, new Map());
      }
      const chartGroup = chartScoreGroups.get(key)!;
      if (!chartGroup.has(entry.sortKey)) {
        chartGroup.set(entry.sortKey, []);
      }
      chartGroup.get(entry.sortKey)!.push(entry);
    }

    // Now process entries, giving tied scores the same points
    for (const entry of typeEntries) {
      // Use the rank from the database (which now uses RANK)
      const points = pointCalculator(entry.rank);

      const userScore: UserChartScore = {
        userAlias: entry.userAlias,
        userId: entry.userId,
        userProfileImageUrl: entry.userProfileImageUrl ? assetS3UrlToCloudFrontUrl(entry.userProfileImageUrl) : null,
        chartHash: entry.chartHash,
        leaderboardType: entry.leaderboardType,
        rank: entry.rank,
        points,
      };

      if (!userScoresMap.has(entry.userId)) {
        userScoresMap.set(entry.userId, {
          userAlias: entry.userAlias,
          userId: entry.userId,
          userProfileImageUrl: entry.userProfileImageUrl ? assetS3UrlToCloudFrontUrl(entry.userProfileImageUrl) : null,
          totalPoints: 0,
          chartScores: [],
        });
      }

      const userOverallScore = userScoresMap.get(entry.userId)!;
      userOverallScore.chartScores.push(userScore);
      userOverallScore.totalPoints += points;
    }

    // Convert to array and sort by total points (descending)
    const leaderboard = Array.from(userScoresMap.values()).sort((a, b) => b.totalPoints - a.totalPoints);

    leaderboardsByType.set(leaderboardType, leaderboard);
    console.log(`${leaderboardType}: ${leaderboard.length} participants`);
  });

  return leaderboardsByType;
}

export function serializeCombinedLeaderboards(leaderboardsByType: Map<string, UserOverallScore[]>): CombinedLeaderboards {
  const generatedAt = new Date().toISOString();

  const leaderboards: { [key: string]: any } = {};

  leaderboardsByType.forEach((leaderboard, leaderboardType) => {
    leaderboards[leaderboardType] = {
      totalParticipants: leaderboard.length,
      rankings: leaderboard.map((user, index) => ({
        rank: index + 1,
        userAlias: user.userAlias,
        userId: user.userId,
        userProfileImageUrl: user.userProfileImageUrl,
        totalPoints: user.totalPoints,
        chartsPlayed: user.chartScores.length,
      })),
    };
  });

  return {
    generatedAt,
    pointsSystem: {
      maxPoints: 10000,
      decayRate: 0.06,
      description:
        'Points awarded based on chart leaderboard position with exponential decay. 1st place = 10,000 points, decreasing exponentially for lower ranks.',
    },
    leaderboards,
  };
}

/**
 * Serialize combined leaderboards for a specific phase with phase-aware point system metadata
 */
export function serializeCombinedLeaderboardsForPhase(leaderboardsByType: Map<string, UserOverallScore[]>, phaseNumber: 1 | 2 | 3): CombinedLeaderboards {
  const generatedAt = new Date().toISOString();
  const leaderboards: any = {};

  leaderboardsByType.forEach((leaderboard, type) => {
    const key = type.includes('HardEX') ? 'hardEX' : type.includes('EX') ? 'EX' : 'money';
    leaderboards[key] = {
      totalParticipants: leaderboard.length,
      rankings: leaderboard.map((user, index) => ({
        rank: index + 1,
        userAlias: user.userAlias,
        userId: user.userId,
        userProfileImageUrl: user.userProfileImageUrl,
        totalPoints: user.totalPoints,
        chartsPlayed: user.chartScores.length,
      })),
    };
  });

  // Phase-specific point system metadata
  const pointsSystem =
    phaseNumber === 1
      ? {
          maxPoints: 10000,
          decayRate: 0.08,
          description:
            'Points awarded based on chart leaderboard position with exponential decay. 1st place = 10,000 points, decreasing exponentially for lower ranks.',
        }
      : {
          maxPoints: 10000,
          decayRate: 0.06,
          system: 'stepped-conservative',
          description:
            'Points use stepped conservative decay: gentle top 10 (0.06 rate), moderate ranks 11-30 (0.055 rate), slow logarithmic tail for 31+. Designed to reduce volatility while maintaining competition.',
        };

  return {
    generatedAt,
    pointsSystem,
    leaderboards,
  };
}

export async function uploadCombinedLeaderboardToS3(data: CombinedLeaderboards, s3Client?: S3Client): Promise<string> {
  const client = s3Client || new S3Client();
  const S3_BUCKET_ASSETS = process.env.S3_BUCKET_ASSETS || 'arrow-cloud-assets';
  const key = `json/blueshift-overall-rankings-(beta).json`;

  console.log(`Uploading leaderboard to S3: ${key}`);

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_ASSETS,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json',
    CacheControl: 'max-age=300', // Cache for 5 minutes since this is updated frequently
  });

  await client.send(command);
  const s3Url = `s3://${S3_BUCKET_ASSETS}/${key}`;
  console.log(`Successfully uploaded to: ${s3Url}`);

  return s3Url;
}

export async function processBlueShiftLeaderboard(prisma: PrismaClient, s3Client?: S3Client): Promise<string> {
  console.log('Blue Shift Beta Event - Overall Leaderboard Calculator');

  const entries = await getBlueShiftLeaderboardEntries(prisma);
  const leaderboardsByType = calculateLeaderboards(entries);

  // Serialize and upload combined leaderboards to S3
  console.log('Serializing combined leaderboards...');
  const combinedData = serializeCombinedLeaderboards(leaderboardsByType);

  console.log('Uploading leaderboard to S3...');
  const result = await uploadCombinedLeaderboardToS3(combinedData, s3Client);

  return result;
}

export async function processUserData(
  entries: LeaderboardEntry[],
  leaderboardsByType: Map<string, UserOverallScore[]>,
  s3Client: S3Client,
  chartData: { [chartHash: string]: ChartData },
  phaseNumber: 1 | 2 | 3,
): Promise<void> {
  console.log(`Processing user data for Blue Shift Phase ${phaseNumber} leaderboards...`);

  // group entries by userId
  const userEntriesMap = new Map<string, LeaderboardEntry[]>();
  for (const entry of entries) {
    if (!userEntriesMap.has(entry.userId)) {
      userEntriesMap.set(entry.userId, []);
    }
    userEntriesMap.get(entry.userId)!.push(entry);
  }

  const S3_BUCKET_ASSETS = process.env.S3_BUCKET_ASSETS || 'arrow-cloud-assets';
  const limit = pLimit(10);
  const uploadPromises = Array.from(userEntriesMap.entries()).map(([userId, userEntries]) =>
    limit(async () => {
      // Fetch existing user data to merge with
      let existingData: UserLeaderboards | null = null;
      try {
        const key = `json/blueshift/user/${userId}.json`;
        const getCommand = new GetObjectCommand({
          Bucket: S3_BUCKET_ASSETS,
          Key: key,
        });
        const response = await s3Client.send(getCommand);
        if (response.Body) {
          const bodyString = await response.Body.transformToString();
          existingData = JSON.parse(bodyString);
        }
      } catch {
        // File doesn't exist yet, that's fine
        console.log(`No existing data for user ${userId}, creating new file`);
      }

      // Start with existing data or create new structure
      const overallScore: UserLeaderboards = existingData || {
        userAlias: userEntries[0].userAlias,
        userId,
        userProfileImageUrl: userEntries[0].userProfileImageUrl ? assetS3UrlToCloudFrontUrl(userEntries[0].userProfileImageUrl) : null,
        leaderboards: {},
      };

      // Update leaderboards for this phase
      for (const [type, leaderboard] of leaderboardsByType) {
        overallScore.leaderboards[type] = {
          rank: leaderboard ? leaderboard.findIndex((user) => user.userId === userId) + 1 : -1, // 1-based rank
          totalPoints: leaderboard ? leaderboard.find((user) => user.userId === userId)?.totalPoints || 0 : 0,
          chartsPlayed: leaderboard ? leaderboard.find((user) => user.userId === userId)?.chartScores.length || 0 : 0,
          chartScores: leaderboard
            ? leaderboard
                .find((user) => user.userId === userId)
                ?.chartScores.map((score) => ({
                  chartHash: score.chartHash,
                  chart: chartData[score.chartHash] || null,
                  rank: score.rank,
                  points: score.points,
                })) || []
            : [],
        };
      }

      // Upload merged data to S3
      const key = `json/blueshift/user/${userId}.json`;

      console.log(`Uploading merged leaderboard data to S3: ${key}`);

      const command = new PutObjectCommand({
        Bucket: S3_BUCKET_ASSETS,
        Key: key,
        Body: JSON.stringify(overallScore, null, 2),
        ContentType: 'application/json',
      });

      await s3Client.send(command);
    }),
  );

  // Wait for all uploads to complete
  await Promise.all(uploadPromises);
}

export function isBlueShiftChart(chartHash: string): boolean {
  return BETA_HASHES.includes(chartHash) || PHASE_1_HASHES.includes(chartHash) || PHASE_2_HASHES.includes(chartHash) || PHASE_3_HASHES.includes(chartHash);
}

/**
 * Process Blue Shift phase leaderboards and upload to S3
 * @param prisma PrismaClient instance
 * @param phaseNumber Phase number (1, 2, or 3)
 * @param chartHashes Array of chart hashes for this phase
 * @param leaderboardIds Array of leaderboard IDs for this phase
 * @param s3Client Optional S3Client for uploading user data
 */
export async function processPhaseLeaderboard(
  prisma: PrismaClient,
  phaseNumber: 1 | 2 | 3,
  chartHashes: string[],
  leaderboardIds: number[],
  s3Client?: S3Client,
): Promise<string> {
  console.log(`Blue Shift Phase ${phaseNumber} - Overall Leaderboard Calculator`);

  const entries = await getLeaderboardEntriesForHashes(prisma, chartHashes, leaderboardIds);

  // Use stepped conservative for Phase 2 and 3, standard exponential for Phase 1
  const pointCalculator = phaseNumber === 1 ? calculatePointsForRank : calculatePointsForRankSteppedConservative;
  const leaderboardsByType = calculateLeaderboards(entries as LeaderboardEntry[], pointCalculator);

  // Serialize and upload combined leaderboards to S3
  console.log(`Serializing Phase ${phaseNumber} combined leaderboards...`);
  const combinedData = serializeCombinedLeaderboardsForPhase(leaderboardsByType, phaseNumber);

  console.log(`Uploading Phase ${phaseNumber} leaderboard to S3...`);
  const S3_BUCKET_ASSETS = process.env.S3_BUCKET_ASSETS || 'arrow-cloud-assets';
  const key = `json/blueshift-overall-rankings-(phase-${phaseNumber}).json`;
  const client = s3Client || new S3Client();

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_ASSETS,
    Key: key,
    Body: JSON.stringify(combinedData, null, 2),
    ContentType: 'application/json',
    CacheControl: 'max-age=300',
  });

  await client.send(command);
  const s3Url = `s3://${S3_BUCKET_ASSETS}/${key}`;
  console.log(`Successfully uploaded Phase ${phaseNumber} to: ${s3Url}`);

  // Process individual user data if s3Client provided
  // Each phase uploads its data, merging with existing phases in S3
  if (s3Client) {
    console.log(`Processing Phase ${phaseNumber} user data...`);
    const chartData = await getChartData(prisma);
    await processUserData(entries as LeaderboardEntry[], leaderboardsByType, s3Client, chartData, phaseNumber);
  }

  return s3Url;
}

/**
 * Blue Shift Beta Event Configuration
 */
export class BlueShiftBetaEventConfig extends BaseEventConfig {
  constructor() {
    super('blueshift-beta', 'Blue Shift Beta', BLUE_SHIFT_BETA_START_DATE, BLUE_SHIFT_BETA_END_DATE, BETA_HASHES, [
      BLUE_SHIFT_HARD_EX_LEADERBOARD_ID,
      BLUE_SHIFT_EX_LEADERBOARD_ID,
      BLUE_SHIFT_MONEY_LEADERBOARD_ID,
    ]);
  }

  async getLeaderboardEntries(prisma: PrismaClient, chartHash?: string): Promise<BaseLeaderboardEntry[]> {
    const leaderboardIds = [BLUE_SHIFT_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_EX_LEADERBOARD_ID, BLUE_SHIFT_MONEY_LEADERBOARD_ID];
    return getLeaderboardEntriesForHashes(prisma, BETA_HASHES, leaderboardIds, chartHash);
  }

  calculatePointsForRank(rank: number): number {
    return calculatePointsForRank(rank);
  }

  getLeaderboardIdForType(leaderboardType: string): number | undefined {
    switch (leaderboardType) {
      case 'Blue Shift HardEX (Beta)':
        return BLUE_SHIFT_HARD_EX_LEADERBOARD_ID;
      case 'Blue Shift EX (Beta)':
        return BLUE_SHIFT_EX_LEADERBOARD_ID;
      case 'Blue Shift Money (Beta)':
        return BLUE_SHIFT_MONEY_LEADERBOARD_ID;
      default:
        return undefined;
    }
  }
}

/**
 * Blue Shift Phase 1 Event Configuration
 */
export class BlueShiftPhase1EventConfig extends BaseEventConfig {
  constructor() {
    super('blueshift-phase-1', 'Blue Shift Phase 1', BLUE_SHIFT_PHASE_1_START_DATE, BLUE_SHIFT_PHASE_1_END_DATE, PHASE_1_HASHES, [
      BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID,
    ]);
  }

  isActiveForUser(userId: string): boolean {
    // Test user bypasses timing restrictions
    if (BLUE_SHIFT_TEST_USER_IDS && BLUE_SHIFT_TEST_USER_IDS.includes(userId)) {
      return true;
    }
    return this.isActive();
  }

  isEligibleChart(chartHash: string): boolean {
    return PHASE_1_HASHES.includes(chartHash);
  }

  async getLeaderboardEntries(prisma: PrismaClient, chartHash?: string): Promise<BaseLeaderboardEntry[]> {
    const leaderboardIds = [BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID];
    return getLeaderboardEntriesForHashes(prisma, PHASE_1_HASHES, leaderboardIds, chartHash);
  }

  calculatePointsForRank(rank: number): number {
    return calculatePointsForRank(rank);
  }

  getLeaderboardIdForType(leaderboardType: string): number | undefined {
    switch (leaderboardType) {
      case 'Blue Shift Phase 1 HardEX':
        return BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID;
      case 'Blue Shift Phase 1 EX':
        return BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID;
      case 'Blue Shift Phase 1 Money':
        return BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID;
      default:
        return undefined;
    }
  }
}

/**
 * Blue Shift Phase 2 Event Configuration
 */
export class BlueShiftPhase2EventConfig extends BaseEventConfig {
  constructor() {
    super('blueshift-phase-2', 'Blue Shift Phase 2', BLUE_SHIFT_PHASE_2_START_DATE, BLUE_SHIFT_PHASE_2_END_DATE, PHASE_2_HASHES, [
      BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID,
    ]);
  }

  isActiveForUser(userId: string): boolean {
    // Test user bypasses timing restrictions
    if (BLUE_SHIFT_TEST_USER_IDS && BLUE_SHIFT_TEST_USER_IDS.includes(userId)) {
      return true;
    }
    return this.isActive();
  }

  isEligibleChart(chartHash: string): boolean {
    return PHASE_2_HASHES.includes(chartHash);
  }

  async getLeaderboardEntries(prisma: PrismaClient, chartHash?: string): Promise<BaseLeaderboardEntry[]> {
    const leaderboardIds = [BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID];
    return getLeaderboardEntriesForHashes(prisma, PHASE_2_HASHES, leaderboardIds, chartHash);
  }

  calculatePointsForRank(rank: number): number {
    return calculatePointsForRankSteppedConservative(rank);
  }

  getLeaderboardIdForType(leaderboardType: string): number | undefined {
    switch (leaderboardType) {
      case 'Blue Shift Phase 2 HardEX':
        return BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID;
      case 'Blue Shift Phase 2 EX':
        return BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID;
      case 'Blue Shift Phase 2 Money':
        return BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID;
      default:
        return undefined;
    }
  }
}

/**
 * Blue Shift Phase 3 Event Configuration
 */
export class BlueShiftPhase3EventConfig extends BaseEventConfig {
  constructor() {
    super('blueshift-phase-3', 'Blue Shift Phase 3', BLUE_SHIFT_PHASE_3_START_DATE, BLUE_SHIFT_PHASE_3_END_DATE, PHASE_3_HASHES, [
      BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID,
    ]);
  }

  isActiveForUser(userId: string): boolean {
    // Test user bypasses timing restrictions
    if (BLUE_SHIFT_TEST_USER_IDS && BLUE_SHIFT_TEST_USER_IDS.includes(userId)) {
      return true;
    }
    return this.isActive();
  }

  isEligibleChart(chartHash: string): boolean {
    return PHASE_3_HASHES.includes(chartHash);
  }

  async getLeaderboardEntries(prisma: PrismaClient, chartHash?: string): Promise<BaseLeaderboardEntry[]> {
    const leaderboardIds = [BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID, BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID];
    return getLeaderboardEntriesForHashes(prisma, PHASE_3_HASHES, leaderboardIds, chartHash);
  }

  calculatePointsForRank(rank: number): number {
    return calculatePointsForRankSteppedConservative(rank);
  }

  getLeaderboardIdForType(leaderboardType: string): number | undefined {
    switch (leaderboardType) {
      case 'Blue Shift Phase 3 HardEX':
        return BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID;
      case 'Blue Shift Phase 3 EX':
        return BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID;
      case 'Blue Shift Phase 3 Money':
        return BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID;
      default:
        return undefined;
    }
  }
}

// Blue shift event leaderboards
abstract class BlueShiftBetaLeaderboard extends BaseLeaderboard {
  isEligible(): boolean {
    if (this.play.createdAt < BLUE_SHIFT_BETA_START_DATE) return false;
    if (this.play.createdAt > BLUE_SHIFT_BETA_END_DATE) return false;
    if (!BETA_HASHES.includes(this.play.chartHash)) return false;

    // Old submissions before schema was finalized are not eligible
    if (parseFloat(this.submissionData._arrowCloudBodyVersion) < 1.2) {
      return false;
    }

    // For now ArrowCloud does not accept rate modded leaderboards
    // As a timing focused platform, speeding up a chart and getting a better score as a result
    // just means that the player is doing worse at timing slowly. That does not mean that
    // future leaderboards may wish to accept rate mods, but for now it's not a thing.
    if (this.submissionData.musicRate !== 1) {
      return false;
    }

    // Note: Fails are allowed here.

    // No autoplay
    if (this.submissionData.usedAutoplay) {
      if (ALLOWED_AUTOPLAY_USERS.includes(this.play.userId)) {
        // Allow autoplay for dev user
        return true;
      }
      return false;
    }

    // Additional future checks would short‑circuit here.
    return true;
  }
}

export class BlueShiftHardEXBetaLeaderboard extends BlueShiftBetaLeaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift HardEX (Beta)';
  }

  getId() {
    return 5;
  }
}

export class BlueShiftEXBetaLeaderboard extends BlueShiftBetaLeaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift EX (Beta)';
  }

  getId() {
    return 6;
  }
}

export class BlueShiftMoneyBetaLeaderboard extends BlueShiftBetaLeaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift Money (Beta)';
  }

  getId() {
    return 7;
  }
}

// Blue Shift Phase 1 Leaderboards
abstract class BlueShiftPhase1Leaderboard extends BaseLeaderboard {
  isEligible(): boolean {
    // Test user bypasses all timing restrictions
    if (BLUE_SHIFT_TEST_USER_IDS && BLUE_SHIFT_TEST_USER_IDS.includes(this.play.userId)) {
      if (!PHASE_1_HASHES.includes(this.play.chartHash)) return false;
    } else {
      if (this.play.createdAt < BLUE_SHIFT_PHASE_1_START_DATE) return false;
      if (this.play.createdAt > BLUE_SHIFT_PHASE_1_END_DATE) return false;
      if (!PHASE_1_HASHES.includes(this.play.chartHash)) return false;
    }

    // Old submissions before schema was finalized are not eligible
    if (parseFloat(this.submissionData._arrowCloudBodyVersion) < 1.2) {
      return false;
    }

    // No rate mods
    if (this.submissionData.musicRate !== 1) {
      return false;
    }

    // No autoplay
    if (this.submissionData.usedAutoplay) {
      if (ALLOWED_AUTOPLAY_USERS.includes(this.play.userId)) {
        return true;
      }
      return false;
    }

    return true;
  }
}

export class BlueShiftPhase1MoneyLeaderboard extends BlueShiftPhase1Leaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift Phase 1 Money';
  }

  getId() {
    return BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID;
  }
}

export class BlueShiftPhase1EXLeaderboard extends BlueShiftPhase1Leaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift Phase 1 EX';
  }

  getId() {
    return BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID;
  }
}

export class BlueShiftPhase1HardEXLeaderboard extends BlueShiftPhase1Leaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift Phase 1 HardEX';
  }

  getId() {
    return BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID;
  }
}

// Blue Shift Phase 2 Leaderboards
abstract class BlueShiftPhase2Leaderboard extends BaseLeaderboard {
  isEligible(): boolean {
    // Test user bypasses all timing restrictions
    if (BLUE_SHIFT_TEST_USER_IDS && BLUE_SHIFT_TEST_USER_IDS.includes(this.play.userId)) {
      if (!PHASE_2_HASHES.includes(this.play.chartHash)) return false;
    } else {
      if (this.play.createdAt < BLUE_SHIFT_PHASE_2_START_DATE) return false;
      if (this.play.createdAt > BLUE_SHIFT_PHASE_2_END_DATE) return false;
      if (!PHASE_2_HASHES.includes(this.play.chartHash)) return false;
    }

    // Old submissions before schema was finalized are not eligible
    if (parseFloat(this.submissionData._arrowCloudBodyVersion) < 1.2) {
      return false;
    }

    // No rate mods
    if (this.submissionData.musicRate !== 1) {
      return false;
    }

    // No autoplay
    if (this.submissionData.usedAutoplay) {
      if (ALLOWED_AUTOPLAY_USERS.includes(this.play.userId)) {
        return true;
      }
      return false;
    }

    return true;
  }
}

export class BlueShiftPhase2MoneyLeaderboard extends BlueShiftPhase2Leaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift Phase 2 Money';
  }

  getId() {
    return BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID;
  }
}

export class BlueShiftPhase2EXLeaderboard extends BlueShiftPhase2Leaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift Phase 2 EX';
  }

  getId() {
    return BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID;
  }
}

export class BlueShiftPhase2HardEXLeaderboard extends BlueShiftPhase2Leaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift Phase 2 HardEX';
  }

  getId() {
    return BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID;
  }
}

// Blue Shift Phase 3 Leaderboards
abstract class BlueShiftPhase3Leaderboard extends BaseLeaderboard {
  isEligible(): boolean {
    // Test user bypasses all timing restrictions
    if (BLUE_SHIFT_TEST_USER_IDS && BLUE_SHIFT_TEST_USER_IDS.includes(this.play.userId)) {
      if (!PHASE_3_HASHES.includes(this.play.chartHash)) return false;
    } else {
      if (this.play.createdAt < BLUE_SHIFT_PHASE_3_START_DATE) return false;
      if (this.play.createdAt > BLUE_SHIFT_PHASE_3_END_DATE) return false;
      if (!PHASE_3_HASHES.includes(this.play.chartHash)) return false;
    }

    // Old submissions before schema was finalized are not eligible
    if (parseFloat(this.submissionData._arrowCloudBodyVersion) < 1.2) {
      return false;
    }

    // No rate mods
    if (this.submissionData.musicRate !== 1) {
      return false;
    }

    // No autoplay
    if (this.submissionData.usedAutoplay) {
      if (ALLOWED_AUTOPLAY_USERS.includes(this.play.userId)) {
        return true;
      }
      return false;
    }

    return true;
  }
}

export class BlueShiftPhase3MoneyLeaderboard extends BlueShiftPhase3Leaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift Phase 3 Money';
  }

  getId() {
    return BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID;
  }
}

export class BlueShiftPhase3EXLeaderboard extends BlueShiftPhase3Leaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift Phase 3 EX';
  }

  getId() {
    return BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID;
  }
}

export class BlueShiftPhase3HardEXLeaderboard extends BlueShiftPhase3Leaderboard implements ILeaderboard {
  getName() {
    return 'Blue Shift Phase 3 HardEX';
  }

  getId() {
    return BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID;
  }
}
