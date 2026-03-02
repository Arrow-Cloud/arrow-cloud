/**
 * Generate Blue Shift Overall Summary
 *
 * This script generates a comprehensive summary JSON file for all Blue Shift phases
 * and calculates an overall leaderboard with weighted phase performance.
 *
 * Overall Ranking Calculation:
 * 1. For each phase, users have total points from their phase performance
 * 2. We rank users within each phase by their total points
 * 3. We apply the point assignment function to each user's phase rank
 * 4. We weight each phase: best performance = 60%, second best = 30%, worst = 10%
 * 5. Sum the weighted scores to get the final overall points
 * 6. Rank all users by their weighted total
 *
 * The JSON structure is optimized with dictionaries to avoid data duplication.
 */

import { PrismaClient } from '../api/prisma/generated/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  getChartData,
  PHASE_1_HASHES,
  PHASE_2_HASHES,
  PHASE_3_HASHES,
  BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID,
  BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID,
  calculatePointsForRankSteppedConservative,
  LeaderboardEntrySchema,
  type LeaderboardEntry,
} from '../api/src/utils/events/blueshift';
import { assetS3UrlToCloudFrontUrl } from '../api/src/utils/s3';

interface ChartLeaderboardEntry {
  rank: number;
  userId: string;
  score: string;
  grade: string;
}

interface ChartLeaderboards {
  [leaderboardType: string]: ChartLeaderboardEntry[];
}

interface ChartInfo {
  songName: string | null;
  artist: string | null;
  stepsType: string | null;
  difficulty: string | null;
  meter: number | null;
  bannerUrl: string | null;
  leaderboards: ChartLeaderboards;
}

interface UserInfo {
  alias: string;
  profileImageUrl: string | null;
}

interface PhaseUserScore {
  userId: string;
  totalPoints: number;
  chartsPlayed: number;
}

interface PhaseLeaderboard {
  [leaderboardType: string]: {
    rankings: PhaseUserScore[];
  };
}

interface OverallUserScore {
  userId: string;
  phaseScores: {
    phase1: { [leaderboardType: string]: { rank: number; points: number; weightedPoints: number } };
    phase2: { [leaderboardType: string]: { rank: number; points: number; weightedPoints: number } };
    phase3: { [leaderboardType: string]: { rank: number; points: number; weightedPoints: number } };
  };
  totalWeightedPoints: number;
  bestPhase: number;
  secondBestPhase: number;
  worstPhase: number;
}

interface BlueShiftOverallSummary {
  generatedAt: string;
  weightingSystem: {
    bestPhase: number;
    secondBestPhase: number;
    worstPhase: number;
  };
  users: { [userId: string]: UserInfo };
  charts: { [chartHash: string]: ChartInfo };
  phases: {
    phase1: {
      startDate: string;
      endDate: string;
      chartHashes: string[];
      leaderboards: PhaseLeaderboard;
    };
    phase2: {
      startDate: string;
      endDate: string;
      chartHashes: string[];
      leaderboards: PhaseLeaderboard;
    };
    phase3: {
      startDate: string;
      endDate: string;
      chartHashes: string[];
      leaderboards: PhaseLeaderboard;
    };
  };
  overall: {
    [leaderboardType: string]: {
      rankings: {
        userId: string;
        totalWeightedPoints: number;
        phaseRanks: {
          phase1: number;
          phase2: number;
          phase3: number;
        };
        phasePoints: {
          phase1: number;
          phase2: number;
          phase3: number;
        };
        phaseWeights: {
          phase1: number;
          phase2: number;
          phase3: number;
        };
      }[];
    };
  };
}

/**
 * Calculate weighted overall points for a user across all phases
 * Best phase = 60%, second best = 30%, worst = 10%
 */
function calculateWeightedOverallPoints(
  phase1Points: number,
  phase2Points: number,
  phase3Points: number,
): {
  total: number;
  bestPhase: number;
  secondBestPhase: number;
  worstPhase: number;
  weights: { phase1: number; phase2: number; phase3: number };
} {
  const phases = [
    { phase: 1, points: phase1Points },
    { phase: 2, points: phase2Points },
    { phase: 3, points: phase3Points },
  ];

  // Sort by points descending
  phases.sort((a, b) => b.points - a.points);

  const bestPhase = phases[0].phase;
  const secondBestPhase = phases[1].phase;
  const worstPhase = phases[2].phase;

  const weights = {
    phase1: 0,
    phase2: 0,
    phase3: 0,
  };

  // Assign weights based on performance
  weights[`phase${bestPhase}` as keyof typeof weights] = 0.6;
  weights[`phase${secondBestPhase}` as keyof typeof weights] = 0.3;
  weights[`phase${worstPhase}` as keyof typeof weights] = 0.1;

  const total = phase1Points * weights.phase1 + phase2Points * weights.phase2 + phase3Points * weights.phase3;

  return {
    total,
    bestPhase,
    secondBestPhase,
    worstPhase,
    weights,
  };
}

/**
 * Fetch leaderboard entries for a specific phase
 */
async function getPhaseLeaderboardEntries(prisma: PrismaClient, chartHashes: string[], leaderboardIds: number[]): Promise<LeaderboardEntry[]> {
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
      WHERE p."chartHash" = ANY(${chartHashes})
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

  const entries = rawResults as any[];
  return entries.map((entry) => LeaderboardEntrySchema.parse(entry));
}

/**
 * Normalize leaderboard type name to base type (HardEX, EX, or Money)
 */
function normalizeLeaderboardType(type: string): string {
  if (type.includes('HardEX') || type.includes('H.EX')) {
    return 'HardEX';
  }
  if (type.includes('EX')) {
    return 'EX';
  }
  // Money or ITG
  return 'Money';
}

/**
 * Calculate phase leaderboards (total points per user per leaderboard type)
 */
function calculatePhaseLeaderboards(entries: LeaderboardEntry[], phaseNumber: 1 | 2 | 3): PhaseLeaderboard {
  const leaderboardTypes = new Set(entries.map((e) => normalizeLeaderboardType(e.leaderboardType)));
  const result: PhaseLeaderboard = {};

  // Use stepped conservative for Phase 2 and 3, standard for Phase 1
  const pointCalculator =
    phaseNumber === 1
      ? (rank: number) => {
          const maxPoints = 10000;
          const decayRate = 0.08;
          const points = maxPoints * Math.exp(-decayRate * (rank - 1));
          return Math.max(1, Math.round(points));
        }
      : calculatePointsForRankSteppedConservative;

  leaderboardTypes.forEach((normalizedType) => {
    const typeEntries = entries.filter((e) => normalizeLeaderboardType(e.leaderboardType) === normalizedType);
    const userScoresMap = new Map<string, PhaseUserScore>();

    typeEntries.forEach((entry) => {
      const points = pointCalculator(entry.rank);

      if (!userScoresMap.has(entry.userId)) {
        userScoresMap.set(entry.userId, {
          userId: entry.userId,
          totalPoints: 0,
          chartsPlayed: 0,
        });
      }

      const userScore = userScoresMap.get(entry.userId)!;
      userScore.totalPoints += points;
      userScore.chartsPlayed++;
    });

    // Convert to array and sort by total points
    const rankings = Array.from(userScoresMap.values()).sort((a, b) => b.totalPoints - a.totalPoints);

    result[normalizedType] = { rankings };
  });

  return result;
}

async function main() {
  console.log('Blue Shift - Generating Overall Summary with Weighted Phase Performance\n');

  const prisma = new PrismaClient();
  const s3Client = new S3Client({});

  try {
    // Fetch all phase data in parallel
    console.log('Fetching Phase 1 data...');
    const phase1Entries = await getPhaseLeaderboardEntries(prisma, PHASE_1_HASHES, [
      BLUE_SHIFT_PHASE_1_MONEY_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_1_EX_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_1_HARD_EX_LEADERBOARD_ID,
    ]);

    console.log('Fetching Phase 2 data...');
    const phase2Entries = await getPhaseLeaderboardEntries(prisma, PHASE_2_HASHES, [
      BLUE_SHIFT_PHASE_2_MONEY_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_2_EX_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_2_HARD_EX_LEADERBOARD_ID,
    ]);

    console.log('Fetching Phase 3 data...');
    const phase3Entries = await getPhaseLeaderboardEntries(prisma, PHASE_3_HASHES, [
      BLUE_SHIFT_PHASE_3_MONEY_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_3_EX_LEADERBOARD_ID,
      BLUE_SHIFT_PHASE_3_HARD_EX_LEADERBOARD_ID,
    ]);

    console.log('Fetching chart data...');
    const allChartData = await getChartData(prisma, [...PHASE_1_HASHES, ...PHASE_2_HASHES, ...PHASE_3_HASHES]);

    // Combine all entries for building users dictionary and chart leaderboards
    const allEntries = [...phase1Entries, ...phase2Entries, ...phase3Entries];

    // Build charts dictionary (use medium banner variant for optimized size)
    // Also build per-chart leaderboards (top 10 per leaderboard type)
    const CHART_LEADERBOARD_SIZE = 10;
    const charts: { [chartHash: string]: ChartInfo } = {};

    // Group all entries by chart hash
    const entriesByChart = new Map<string, LeaderboardEntry[]>();
    allEntries.forEach((entry) => {
      if (!entriesByChart.has(entry.chartHash)) {
        entriesByChart.set(entry.chartHash, []);
      }
      entriesByChart.get(entry.chartHash)!.push(entry);
    });

    Object.entries(allChartData).forEach(([hash, data]) => {
      // Get medium banner URL from variants (preferring jpeg/webp)
      // bannerVariants structure: { md: [{format, url, ...}, ...], sm: [...], original: [...] }
      let mediumBannerUrl: string | null = null;
      if (data.bannerVariants?.md && Array.isArray(data.bannerVariants.md)) {
        // Prefer webp, then jpeg
        const webp = data.bannerVariants.md.find((v: any) => v.format === 'webp');
        const jpeg = data.bannerVariants.md.find((v: any) => v.format === 'jpeg');
        mediumBannerUrl = webp?.url || jpeg?.url || data.bannerVariants.md[0]?.url || null;
      }
      // Fallback to mdBannerUrl or original bannerUrl
      if (!mediumBannerUrl) {
        mediumBannerUrl = data.mdBannerUrl || data.bannerUrl;
      }

      // Build leaderboards for this chart
      const chartEntries = entriesByChart.get(hash) || [];
      const leaderboards: ChartLeaderboards = {};

      // Group by normalized leaderboard type
      const entriesByType = new Map<string, LeaderboardEntry[]>();
      chartEntries.forEach((entry) => {
        const normalizedType = normalizeLeaderboardType(entry.leaderboardType);
        if (!entriesByType.has(normalizedType)) {
          entriesByType.set(normalizedType, []);
        }
        entriesByType.get(normalizedType)!.push(entry);
      });

      // For each leaderboard type, get top entries
      entriesByType.forEach((entries, leaderboardType) => {
        // Sort by rank and take top N
        const sortedEntries = entries.sort((a, b) => a.rank - b.rank).slice(0, CHART_LEADERBOARD_SIZE);
        leaderboards[leaderboardType] = sortedEntries.map((entry) => ({
          rank: entry.rank,
          userId: entry.userId,
          score: entry.data?.score || '0.00',
          grade: entry.data?.grade || 'F',
        }));
      });

      charts[hash] = {
        songName: data.songName,
        artist: data.artist,
        stepsType: data.stepsType,
        difficulty: data.difficulty,
        meter: data.meter,
        bannerUrl: mediumBannerUrl,
        leaderboards,
      };
    });

    // Build users dictionary
    const users: { [userId: string]: UserInfo } = {};
    allEntries.forEach((entry) => {
      if (!users[entry.userId]) {
        users[entry.userId] = {
          alias: entry.userAlias,
          profileImageUrl: entry.userProfileImageUrl ? assetS3UrlToCloudFrontUrl(entry.userProfileImageUrl) : null,
        };
      }
    });

    console.log(`Found ${Object.keys(users).length} unique participants`);
    console.log(`Found ${Object.keys(charts).length} unique charts`);

    // Calculate phase leaderboards
    console.log('\nCalculating phase leaderboards...');
    const phase1Leaderboards = calculatePhaseLeaderboards(phase1Entries, 1);
    const phase2Leaderboards = calculatePhaseLeaderboards(phase2Entries, 2);
    const phase3Leaderboards = calculatePhaseLeaderboards(phase3Entries, 3);

    // Calculate overall leaderboards with weighted phase performance
    console.log('\nCalculating overall weighted leaderboards...');
    // We only have 3 normalized types: HardEX, EX, Money
    const normalizedTypes = ['HardEX', 'EX', 'Money'];
    const overall: BlueShiftOverallSummary['overall'] = {};

    normalizedTypes.forEach((normalizedType) => {
      const phase1Rankings = phase1Leaderboards[normalizedType]?.rankings || [];
      const phase2Rankings = phase2Leaderboards[normalizedType]?.rankings || [];
      const phase3Rankings = phase3Leaderboards[normalizedType]?.rankings || [];

      // Get all users who participated in at least one phase
      const allUserIds = new Set([...phase1Rankings.map((r) => r.userId), ...phase2Rankings.map((r) => r.userId), ...phase3Rankings.map((r) => r.userId)]);

      // For each user, calculate their weighted overall score
      const overallScores: OverallUserScore[] = [];

      allUserIds.forEach((userId) => {
        // Find user's rank in each phase (based on their position in that phase's leaderboard)
        const phase1Rank = phase1Rankings.findIndex((r) => r.userId === userId) + 1;
        const phase2Rank = phase2Rankings.findIndex((r) => r.userId === userId) + 1;
        const phase3Rank = phase3Rankings.findIndex((r) => r.userId === userId) + 1;

        // Calculate points based on rank (0 if didn't participate)
        const phase1Points = phase1Rank > 0 ? calculatePointsForRankSteppedConservative(phase1Rank) : 0;
        const phase2Points = phase2Rank > 0 ? calculatePointsForRankSteppedConservative(phase2Rank) : 0;
        const phase3Points = phase3Rank > 0 ? calculatePointsForRankSteppedConservative(phase3Rank) : 0;

        // Calculate weighted total
        const { total, bestPhase, secondBestPhase, worstPhase, weights } = calculateWeightedOverallPoints(phase1Points, phase2Points, phase3Points);

        overallScores.push({
          userId,
          phaseScores: {
            phase1: {
              [normalizedType]: {
                rank: phase1Rank,
                points: phase1Points,
                weightedPoints: phase1Points * weights.phase1,
              },
            },
            phase2: {
              [normalizedType]: {
                rank: phase2Rank,
                points: phase2Points,
                weightedPoints: phase2Points * weights.phase2,
              },
            },
            phase3: {
              [normalizedType]: {
                rank: phase3Rank,
                points: phase3Points,
                weightedPoints: phase3Points * weights.phase3,
              },
            },
          },
          totalWeightedPoints: total,
          bestPhase,
          secondBestPhase,
          worstPhase,
        });
      });

      // Sort by weighted total points
      overallScores.sort((a, b) => b.totalWeightedPoints - a.totalWeightedPoints);

      // Build rankings output
      overall[normalizedType] = {
        rankings: overallScores.map((score) => ({
          userId: score.userId,
          totalWeightedPoints: score.totalWeightedPoints,
          phaseRanks: {
            phase1: score.phaseScores.phase1[normalizedType].rank,
            phase2: score.phaseScores.phase2[normalizedType].rank,
            phase3: score.phaseScores.phase3[normalizedType].rank,
          },
          phasePoints: {
            phase1: score.phaseScores.phase1[normalizedType].points,
            phase2: score.phaseScores.phase2[normalizedType].points,
            phase3: score.phaseScores.phase3[normalizedType].points,
          },
          phaseWeights: {
            phase1:
              score.phaseScores.phase1[normalizedType].points > 0
                ? score.phaseScores.phase1[normalizedType].weightedPoints / score.phaseScores.phase1[normalizedType].points
                : 0,
            phase2:
              score.phaseScores.phase2[normalizedType].points > 0
                ? score.phaseScores.phase2[normalizedType].weightedPoints / score.phaseScores.phase2[normalizedType].points
                : 0,
            phase3:
              score.phaseScores.phase3[normalizedType].points > 0
                ? score.phaseScores.phase3[normalizedType].weightedPoints / score.phaseScores.phase3[normalizedType].points
                : 0,
          },
        })),
      };

      console.log(`  ${normalizedType}: ${overallScores.length} participants in overall ranking`);
    });

    // Build final summary object
    const summary: BlueShiftOverallSummary = {
      generatedAt: new Date().toISOString(),
      weightingSystem: {
        bestPhase: 0.6,
        secondBestPhase: 0.3,
        worstPhase: 0.1,
      },
      users,
      charts,
      phases: {
        phase1: {
          startDate: '2025-12-05T12:00:00Z',
          endDate: '2025-12-26T12:00:00Z',
          chartHashes: PHASE_1_HASHES,
          leaderboards: phase1Leaderboards,
        },
        phase2: {
          startDate: '2025-12-26T12:00:00Z',
          endDate: '2026-01-16T12:00:00Z',
          chartHashes: PHASE_2_HASHES,
          leaderboards: phase2Leaderboards,
        },
        phase3: {
          startDate: '2026-01-16T12:00:00Z',
          endDate: '2026-02-06T12:00:00Z',
          chartHashes: PHASE_3_HASHES,
          leaderboards: phase3Leaderboards,
        },
      },
      overall,
    };

    // Upload to S3
    const S3_BUCKET_ASSETS = process.env.S3_BUCKET_ASSETS || 'arrow-cloud-assets';
    const key = 'json/blueshift-overall-summary.json';

    console.log(`\nUploading overall summary to S3: ${key}`);
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_ASSETS,
      Key: key,
      Body: JSON.stringify(summary, null, 2),
      ContentType: 'application/json',
      CacheControl: 'max-age=300',
    });

    await s3Client.send(command);
    const s3Url = `s3://${S3_BUCKET_ASSETS}/${key}`;
    console.log(`Successfully uploaded to: ${s3Url}`);

    // Print some statistics
    console.log('\n=== Summary Statistics ===');
    console.log(`Total unique users: ${Object.keys(users).length}`);
    console.log(`Total unique charts: ${Object.keys(charts).length}`);
    console.log(`Total phase 1 entries: ${phase1Entries.length}`);
    console.log(`Total phase 2 entries: ${phase2Entries.length}`);
    console.log(`Total phase 3 entries: ${phase3Entries.length}`);

    normalizedTypes.forEach((type) => {
      const topUser = overall[type].rankings[0];
      if (topUser) {
        console.log(`\n${type} overall winner:`);
        console.log(`  ${users[topUser.userId].alias}`);
        console.log(`  Total weighted points: ${topUser.totalWeightedPoints.toFixed(2)}`);
        console.log(`  Phase ranks: P1=${topUser.phaseRanks.phase1}, P2=${topUser.phaseRanks.phase2}, P3=${topUser.phaseRanks.phase3}`);
        console.log(
          `  Phase weights: P1=${(topUser.phaseWeights.phase1 * 100).toFixed(0)}%, P2=${(topUser.phaseWeights.phase2 * 100).toFixed(0)}%, P3=${(topUser.phaseWeights.phase3 * 100).toFixed(0)}%`,
        );
      }
    });

    console.log('\n✅ Overall summary generation complete!');
  } catch (error) {
    console.error('Error generating overall summary:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
