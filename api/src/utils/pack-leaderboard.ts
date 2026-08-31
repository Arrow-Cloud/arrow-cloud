import type { PrismaClient, Play } from '../../prisma/generated/client';
import { Prisma } from '../../prisma/generated/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  GLOBAL_HARD_EX_LEADERBOARD_ID,
  GLOBAL_EX_LEADERBOARD_ID,
  GLOBAL_MONEY_LEADERBOARD_ID,
  GLOBAL_ITG_RATE_LEADERBOARD_ID,
  GLOBAL_EX_RATE_LEADERBOARD_ID,
  DEFAULT_LEADERBOARDS,
} from './leaderboard';
import { assetS3UrlToCloudFrontUrl, S3_BUCKET_ASSETS, CLOUDFRONT_ASSETS_URL } from './s3';
import { getUserPreferredLeaderboardIds } from '../services/userPreferredLeaderboards';
import type { PackResultImageData, PackResultImageEntry, LeaderboardPageData, LeaderboardPageEntry } from './pack-result-image';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pack IDs that have pack leaderboards enabled. */
export const ELIGIBLE_PACK_IDS: number[] = [101, 102, 131, 346, 348, 371, 380];

/** The difficulty slots we compute pack leaderboards for. */
export const PACK_LEADERBOARD_DIFFICULTIES = ['medium', 'hard', 'challenge'] as const;
export type PackLeaderboardDifficulty = (typeof PACK_LEADERBOARD_DIFFICULTIES)[number];

/** Scoring system label → global Leaderboard row id mapping. */
export const SCORING_SYSTEMS = {
  HardEX: GLOBAL_HARD_EX_LEADERBOARD_ID,
  EX: GLOBAL_EX_LEADERBOARD_ID,
  ITG: GLOBAL_MONEY_LEADERBOARD_ID,
  ITGRate: GLOBAL_ITG_RATE_LEADERBOARD_ID,
  EXRate: GLOBAL_EX_RATE_LEADERBOARD_ID,
} as const;
export type ScoringSystemKey = keyof typeof SCORING_SYSTEMS;
export const SCORING_SYSTEM_KEYS = Object.keys(SCORING_SYSTEMS) as ScoringSystemKey[];

/** A single ranking entry (references a user id in the users dictionary). */
export interface PackLeaderboardRanking {
  rank: number;
  userId: string;
  totalScore: number;
  chartsPlayed: number;
}

/** Per-scoring-system leaderboard. */
export interface PackScoringLeaderboard {
  totalParticipants: number;
  rankings: PackLeaderboardRanking[];
}

/** The full output structure, JSON-optimised with a users dictionary. */
export interface PackLeaderboardOutput {
  generatedAt: string;
  packId: number;
  packName: string;
  /** De-duplicated user lookup: userId → { alias, profileImageUrl } */
  users: Record<string, { alias: string; profileImageUrl: string | null }>;
  /** difficulty → scoringSystem → leaderboard */
  leaderboards: Record<string, Record<string, PackScoringLeaderboard>>;
}

/** A pack-leaderboard-eligible pack this chart belongs to, and which difficulty slot it's in. */
export interface EligiblePackMatch {
  packId: number;
  packName: string;
  difficulty: PackLeaderboardDifficulty;
  meter: number | null;
  chartTitle: string;
  chartArtist: string;
}

/**
 * Given a chart hash, find every pack-leaderboard-eligible pack it belongs to (and the difficulty
 * slot it's in within each). A chart can appear under different difficulty labels in different
 * simfiles of the same pack (rare), so this can return more than one match per pack.
 */
export async function getEligiblePacksForChart(prisma: PrismaClient, chartHash: string): Promise<EligiblePackMatch[]> {
  const simfileCharts = await prisma.simfileChart.findMany({
    where: {
      chartHash,
      difficulty: { in: [...PACK_LEADERBOARD_DIFFICULTIES] },
    },
    select: {
      difficulty: true,
      meter: true,
      simfile: { select: { packId: true, title: true, artist: true, pack: { select: { name: true } } } },
    },
  });

  const seen = new Set<string>();
  const matches: EligiblePackMatch[] = [];
  for (const sc of simfileCharts) {
    const packId = sc.simfile.packId;
    if (!sc.difficulty || !ELIGIBLE_PACK_IDS.includes(packId)) continue;
    const key = `${packId}:${sc.difficulty}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({
      packId,
      packName: sc.simfile.pack.name,
      difficulty: sc.difficulty as PackLeaderboardDifficulty,
      meter: sc.meter,
      chartTitle: sc.simfile.title,
      chartArtist: sc.simfile.artist,
    });
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Curved point buckets for converting a percentage score (0-100) to points.
 * Each bucket defines a score range and the points awarded for fully
 * completing that range. Partial completion awards proportional points.
 * Maximum possible points per chart: 1000.
 */
const POINT_BUCKETS: { min: number; max: number; points: number }[] = [
  { min: 0, max: 80, points: 200 },
  { min: 80, max: 85, points: 100 },
  { min: 85, max: 90, points: 100 },
  { min: 90, max: 92, points: 100 },
  { min: 92, max: 94, points: 100 },
  { min: 94, max: 96, points: 100 },
  { min: 96, max: 98, points: 100 },
  { min: 98, max: 99, points: 100 },
  { min: 99, max: 100, points: 100 },
];

/**
 * Convert a percentage score (0–100) to curved points using the bucket system.
 * Full buckets below the score are awarded entirely; the bucket containing
 * the score awards a proportional amount.
 */
export function scoreToCurvedPoints(score: number): number {
  let points = 0;
  for (const bucket of POINT_BUCKETS) {
    if (score <= bucket.min) break;
    const range = bucket.max - bucket.min;
    const progress = Math.min(score, bucket.max) - bucket.min;
    points += (progress / range) * bucket.points;
  }
  return points;
}

interface BestScoreRow {
  userId: string;
  userAlias: string;
  userProfileImageUrl: string | null;
  chartHash: string;
  leaderboardId: number;
  score: number;
}

/**
 * For a given set of chart hashes and leaderboard IDs, fetch each user's single
 * best score per chart per leaderboard. "Best" is determined by the PlayLeaderboard
 * sortKey (DESC) which already encodes score + tie-break.
 *
 * Charts in cmodIneligibleHashes exclude plays where the player used CMOD
 * (modifiers.speed.type = 'C').
 */
async function getBestScoresForCharts(
  prisma: PrismaClient,
  chartHashes: string[],
  leaderboardIds: number[],
  cmodIneligibleHashes: Set<string>,
  userId?: string,
): Promise<BestScoreRow[]> {
  if (chartHashes.length === 0) return [];

  const ineligibleArray = [...cmodIneligibleHashes];
  const cmodFilter =
    ineligibleArray.length === 0
      ? Prisma.empty
      : Prisma.sql`AND (NOT (p."chartHash" = ANY(${ineligibleArray})) OR (p.modifiers->'speed'->>'type') IS DISTINCT FROM 'C')`;
  const userFilter = userId ? Prisma.sql`AND p."userId" = ${userId}` : Prisma.empty;

  const rows: any[] = await prisma.$queryRaw`
    SELECT DISTINCT ON (p."userId", p."chartHash", pl."leaderboardId")
      p."userId"               AS "userId",
      u.alias                  AS "userAlias",
      u."profileImageUrl"      AS "userProfileImageUrl",
      p."chartHash"            AS "chartHash",
      pl."leaderboardId"       AS "leaderboardId",
      (pl.data->>'score')::double precision AS score
    FROM "PlayLeaderboard" pl
    JOIN "Play" p  ON pl."playId" = p.id
    JOIN "User" u  ON p."userId" = u.id
    WHERE p."chartHash" = ANY(${chartHashes})
      AND pl."leaderboardId" = ANY(${leaderboardIds})
      AND u.banned = false
      AND u."shadowBanned" = false
      ${cmodFilter}
      ${userFilter}
    ORDER BY p."userId", p."chartHash", pl."leaderboardId", pl."sortKey" DESC
  `;

  return rows.map((r) => ({
    userId: r.userId,
    userAlias: r.userAlias,
    userProfileImageUrl: r.userProfileImageUrl,
    chartHash: r.chartHash,
    leaderboardId: Number(r.leaderboardId),
    score: Number(r.score),
  }));
}

/**
 * Rank one (difficulty, scoringSystem) pack leaderboard from a pre-indexed set of best scores.
 * `scoreIndex` is keyed by `${chartHash}:${leaderboardId}` (see `calculatePackLeaderboards`'s and
 * `computePackResultImages`'s index-building code) - this is the shared core of both the full
 * all-users batch computation and the single-`(pack, difficulty)`-scoped live lookup, so they can
 * never drift apart from each other.
 */
function rankPackScoring(scoreIndex: Map<string, BestScoreRow[]>, chartHashes: string[], leaderboardId: number): PackScoringLeaderboard {
  const userTotals = new Map<string, { totalScore: number; chartsPlayed: number }>();

  for (const chartHash of chartHashes) {
    const rows = scoreIndex.get(`${chartHash}:${leaderboardId}`) ?? [];
    for (const row of rows) {
      const curvedPoints = scoreToCurvedPoints(row.score);
      const existing = userTotals.get(row.userId);
      if (existing) {
        existing.totalScore += curvedPoints;
        existing.chartsPlayed += 1;
      } else {
        userTotals.set(row.userId, { totalScore: curvedPoints, chartsPlayed: 1 });
      }
    }
  }

  const sorted = Array.from(userTotals.entries())
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.totalScore - a.totalScore);

  return {
    totalParticipants: sorted.length,
    rankings: sorted.map((entry, idx) => ({ rank: idx + 1, userId: entry.userId, totalScore: entry.totalScore, chartsPlayed: entry.chartsPlayed })),
  };
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Calculate pack leaderboards for a single pack.
 *
 * Returns a fully-serialisable {@link PackLeaderboardOutput} containing 15
 * leaderboards (3 difficulties × 5 scoring systems) with a de-duplicated
 * users dictionary.
 */
export async function calculatePackLeaderboards(prisma: PrismaClient, packId: number): Promise<PackLeaderboardOutput> {
  // 1. Fetch pack info
  const pack = await prisma.pack.findUniqueOrThrow({
    where: { id: packId },
    select: { id: true, name: true },
  });

  // 2. Gather all chart hashes in this pack grouped by difficulty slot
  //    Path: Pack → Simfile → SimfileChart (holds difficulty + chartHash)
  const simfileCharts = await prisma.simfileChart.findMany({
    where: {
      simfile: { packId },
      difficulty: { in: [...PACK_LEADERBOARD_DIFFICULTIES] },
    },
    select: {
      chartHash: true,
      difficulty: true,
      cmodIneligible: true,
    },
  });

  // Group chart hashes by difficulty
  const hashesByDifficulty: Record<string, string[]> = {};
  for (const d of PACK_LEADERBOARD_DIFFICULTIES) {
    hashesByDifficulty[d] = [];
  }
  const cmodIneligibleHashes = new Set<string>();
  for (const sc of simfileCharts) {
    if (sc.difficulty && sc.difficulty in hashesByDifficulty) {
      // Avoid duplicates (a chart hash can appear in multiple simfiles within the pack)
      if (!hashesByDifficulty[sc.difficulty].includes(sc.chartHash)) {
        hashesByDifficulty[sc.difficulty].push(sc.chartHash);
      }
    }
    if (sc.cmodIneligible) {
      cmodIneligibleHashes.add(sc.chartHash);
    }
  }

  // 3. Collect all unique chart hashes across all difficulties for one DB round-trip
  const allHashes = [...new Set(Object.values(hashesByDifficulty).flat())];
  const allLeaderboardIds = Object.values(SCORING_SYSTEMS) as number[];

  // 4. Fetch best scores (CMOD plays excluded for flagged charts)
  const bestScores = await getBestScoresForCharts(prisma, allHashes, allLeaderboardIds, cmodIneligibleHashes);

  // 5. Build the users dictionary and the leaderboard results
  const users: Record<string, { alias: string; profileImageUrl: string | null }> = {};
  const leaderboards: Record<string, Record<string, PackScoringLeaderboard>> = {};

  // Index best scores by chartHash+leaderboardId for fast lookup
  const scoreIndex = new Map<string, BestScoreRow[]>();
  for (const row of bestScores) {
    // Track user info
    if (!users[row.userId]) {
      users[row.userId] = {
        alias: row.userAlias,
        profileImageUrl: assetS3UrlToCloudFrontUrl(row.userProfileImageUrl),
      };
    }
    const key = `${row.chartHash}:${row.leaderboardId}`;
    if (!scoreIndex.has(key)) scoreIndex.set(key, []);
    scoreIndex.get(key)!.push(row);
  }

  for (const difficulty of PACK_LEADERBOARD_DIFFICULTIES) {
    const diffHashes = hashesByDifficulty[difficulty];
    leaderboards[difficulty] = {};

    for (const [systemKey, leaderboardId] of Object.entries(SCORING_SYSTEMS)) {
      leaderboards[difficulty][systemKey] = rankPackScoring(scoreIndex, diffHashes, leaderboardId);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    packId: pack.id,
    packName: pack.name,
    users,
    leaderboards,
  };
}

// ---------------------------------------------------------------------------
// Live, synchronous, single-play result images
// ---------------------------------------------------------------------------

const SCORING_SYSTEM_LABELS: Record<ScoringSystemKey, string> = {
  HardEX: 'H.EX',
  EX: 'EX',
  ITG: 'ITG',
  ITGRate: 'ITG (Rate)',
  EXRate: 'EX (Rate)',
};

// Same "top + rivals + nearby-you" convention already used by the in-game/site leaderboard
// endpoint (api/src/controllers/leaderboard.ts) and the streamer widget's buildNearbyPlayers
// (api/src/controllers/widget.ts), rather than a flat top-N: top 2, your own row, your immediate
// neighbors (rank ±1), your top-ranked rival, your nearest-by-rank rival, then filled out to a
// target size with whatever's closest to your rank.
const LEADERBOARD_PAGE_TOP_N = 2;
const LEADERBOARD_PAGE_TARGET_SIZE = 7;

function selectNearbyRankings(rankings: LeaderboardPageEntry[]): LeaderboardPageEntry[] {
  const selfEntry = rankings.find((r) => r.isSelf);
  const top = rankings.filter((r) => r.rank <= LEADERBOARD_PAGE_TOP_N);
  const neighbors = selfEntry ? rankings.filter((r) => r.rank === selfEntry.rank - 1 || r.rank === selfEntry.rank + 1) : [];

  const rivalsByRank = rankings.filter((r) => r.isRival).sort((a, b) => a.rank - b.rank);
  const topRival = rivalsByRank[0];
  let nearestRival: LeaderboardPageEntry | undefined;
  if (selfEntry && rivalsByRank.length) {
    const byDistance = [...rivalsByRank].sort((a, b) => Math.abs(a.rank - selfEntry.rank) - Math.abs(b.rank - selfEntry.rank));
    nearestRival = byDistance[0] === topRival && byDistance.length > 1 ? byDistance[1] : byDistance[0];
  }

  const byAlias = new Map<string, LeaderboardPageEntry>();
  const add = (r?: LeaderboardPageEntry) => {
    if (r && !byAlias.has(r.alias)) byAlias.set(r.alias, r);
  };
  top.forEach(add);
  add(selfEntry);
  neighbors.forEach(add);
  add(topRival);
  add(nearestRival);

  if (byAlias.size < LEADERBOARD_PAGE_TARGET_SIZE && selfEntry) {
    const remaining = rankings.filter((r) => !byAlias.has(r.alias)).sort((a, b) => Math.abs(a.rank - selfEntry.rank) - Math.abs(b.rank - selfEntry.rank));
    for (const r of remaining) {
      if (byAlias.size >= LEADERBOARD_PAGE_TARGET_SIZE) break;
      byAlias.set(r.alias, r);
    }
  }

  return Array.from(byAlias.values()).sort((a, b) => a.rank - b.rank);
}

/**
 * After a score submission on a pack-leaderboard-eligible chart, synchronously render one
 * results-card PNG per matched pack (per `getEligiblePacksForChart`), showing this play's
 * delta vs. the player's own previous best and live rank, for each scoring system the player
 * has configured as preferred in-game (falling back to `DEFAULT_LEADERBOARDS`). Uploads each
 * image to the existing assets bucket/CDN and returns their fully-qualified URLs.
 *
 * Fully stateless/re-derivable from `play` alone (`play.id`/`play.createdAt` are immutable), so
 * there's nothing to persist - see the "Revised architecture" section of the approved plan.
 * No-op (single cheap query, no added latency) for the common case of a non-pack-eligible chart.
 */
// TEMPORARY: gate this feature to a handful of test accounts while it's being validated in
// production. Remove this (and the check below) once we're ready to roll it out to everyone.
const RESULT_IMAGE_TEST_USER_IDS = new Set(['27cfc687-8d10-4132-bd29-da3b4ef54dfb', '3ac37479-c87f-459c-b3aa-c17e95c1a0d8']);

export async function computePackResultImages(prisma: PrismaClient, s3Client: S3Client, play: Play): Promise<string[]> {
  if (!RESULT_IMAGE_TEST_USER_IDS.has(play.userId)) return [];

  const matches = await getEligiblePacksForChart(prisma, play.chartHash);
  if (matches.length === 0) return [];

  const [preferredIds, rivalRows] = await Promise.all([
    getUserPreferredLeaderboardIds(prisma, play.userId, 'GAME'),
    prisma.userRival.findMany({ where: { userId: play.userId }, select: { rivalUserId: true } }),
  ]);
  const rivalIds = new Set(rivalRows.map((r) => r.rivalUserId));
  const allScoringIds = Object.values(SCORING_SYSTEMS) as number[];
  // Capped at 3 - the card's layout was only ever designed to comfortably fit 3 leaderboard tiles.
  const MAX_RESULT_IMAGE_LEADERBOARDS = 3;
  const selectedIds = (preferredIds.length ? preferredIds : DEFAULT_LEADERBOARDS)
    .filter((id) => allScoringIds.includes(id))
    .slice(0, MAX_RESULT_IMAGE_LEADERBOARDS);
  if (selectedIds.length === 0) return [];

  // This play's own scores, per leaderboard - only leaderboards the play was actually eligible
  // for (e.g. rate boards) will have a row here.
  const ownScores = await prisma.playLeaderboard.findMany({
    where: { playId: play.id, leaderboardId: { in: selectedIds } },
    select: { leaderboardId: true, data: true },
  });
  const ownScoreByLeaderboardId = new Map<number, number>();
  for (const row of ownScores) {
    const data = row.data as { score?: string } | null;
    const score = data?.score ? parseFloat(data.score) : null;
    if (score !== null) ownScoreByLeaderboardId.set(row.leaderboardId, score);
  }
  if (ownScoreByLeaderboardId.size === 0) return [];

  // Imported once, dynamically (not at module scope), so that a load-time failure in the
  // satori/resvg native-module chain can only ever break this one call - not apiLambda's cold
  // start, and not the pack-leaderboard SQS consumer, which imports this same file for unrelated
  // helpers.
  const { renderPackResultImage, renderLeaderboardPage } = await import('./pack-result-image');

  // Every image (the summary card + one page per selected leaderboard, per matched pack) is
  // independent of every other, so render+upload them all concurrently rather than one at a time
  // - that's the main latency lever here beyond the already-batched DB queries below.
  const uploadTasks: Promise<string>[] = [];
  const upload = (key: string, png: Promise<Buffer>): Promise<string> =>
    png.then((body) =>
      s3Client
        .send(new PutObjectCommand({ Bucket: S3_BUCKET_ASSETS, Key: key, Body: body, ContentType: 'image/png', CacheControl: 'max-age=31536000' }))
        .then(() => `${CLOUDFRONT_ASSETS_URL}/${key}`),
    );

  for (const match of matches) {
    const simfileCharts = await prisma.simfileChart.findMany({
      where: { simfile: { packId: match.packId }, difficulty: match.difficulty },
      select: { chartHash: true, cmodIneligible: true },
    });
    const diffHashes = [...new Set(simfileCharts.map((sc) => sc.chartHash))];
    const cmodIneligibleHashes = new Set(simfileCharts.filter((sc) => sc.cmodIneligible).map((sc) => sc.chartHash));
    const leaderboardIds = [...ownScoreByLeaderboardId.keys()];

    // Scans every chart in the difficulty slot across every participant - batched once across
    // every selected leaderboard for this pack instead of once per leaderboard, since repeating a
    // full-pack scan per leaderboard was the most expensive redundant cost in this function.
    // rankPackScoring below still ranks one leaderboard at a time, it just reads from this shared,
    // pre-fetched index instead of re-querying per leaderboard. This is also the single source of
    // truth for "your current pack total" (via rankPackScoring's userRanking.totalScore below) -
    // it reflects each user's true best per chart regardless of whether this specific play happens
    // to be one of them, so there's no separate "this user's other charts" query needed either.
    const allBestScoresAll = await getBestScoresForCharts(prisma, diffHashes, leaderboardIds, cmodIneligibleHashes);
    const scoreIndex = new Map<string, BestScoreRow[]>();
    for (const row of allBestScoresAll) {
      const key = `${row.chartHash}:${row.leaderboardId}`;
      if (!scoreIndex.has(key)) scoreIndex.set(key, []);
      scoreIndex.get(key)!.push(row);
    }

    // Every row across every leaderboard came from the same batched query above, so this is
    // free - no extra query needed just to know who everyone is.
    const aliasByUserId = new Map<string, string>();
    for (const row of allBestScoresAll) aliasByUserId.set(row.userId, row.userAlias);

    const entries: PackResultImageEntry[] = [];
    const leaderboardPages: LeaderboardPageData[] = [];

    for (const [leaderboardId, score] of ownScoreByLeaderboardId) {
      const systemKey = (Object.keys(SCORING_SYSTEMS) as ScoringSystemKey[]).find((k) => SCORING_SYSTEMS[k] === leaderboardId);
      if (!systemKey) continue;

      // Previous best on this chart, strictly before this play (session.ts's PB-lookup pattern).
      const previousBest = await prisma.playLeaderboard.findFirst({
        where: { leaderboardId, play: { userId: play.userId, chartHash: play.chartHash, createdAt: { lt: play.createdAt } } },
        orderBy: { sortKey: 'desc' },
        select: { data: true },
      });
      const previousData = previousBest?.data as { score?: string } | null;
      const previousScore = previousData?.score ? parseFloat(previousData.score) : 0;

      // "Chart points"/"pack total" track your BEST-EVER score on this chart, not necessarily
      // this specific play's score - a replay that didn't improve on your existing best must not
      // make either of those look like they went down. scoreDelta (below) is the one place that's
      // allowed to go negative, since it's reporting this attempt's performance, not your standing.
      const effectiveScore = Math.max(score, previousScore);

      // Points are always floored, never rounded to nearest - a player should never see more
      // points than they've actually earned. chartPoints/chartPointsBefore are floored first and
      // the delta computed from those already-floored values, so displayed numbers always agree
      // (after - before === delta) instead of drifting from rounding the delta separately.
      const chartPoints = Math.floor(scoreToCurvedPoints(effectiveScore));
      const chartPointsBefore = Math.floor(scoreToCurvedPoints(previousScore));
      const chartPointsDelta = chartPoints - chartPointsBefore;

      const ranked = rankPackScoring(scoreIndex, diffHashes, leaderboardId);
      const userRanking = ranked.rankings.find((r) => r.userId === play.userId);
      // The user's true current pack total, straight from the live ranking data (built from every
      // user's actual best per chart) - not reconstructed from this play's own score, which could
      // understate it if this play wasn't actually an improvement.
      const packTotal = Math.floor(userRanking?.totalScore ?? 0);

      entries.push({
        leaderboardKey: systemKey,
        label: SCORING_SYSTEM_LABELS[systemKey],
        score,
        scoreDelta: Math.round((score - previousScore) * 100) / 100,
        chartPoints,
        chartPointsDelta,
        packTotal,
        rank: userRanking?.rank ?? 1,
        totalParticipants: ranked.totalParticipants,
      });

      const rankingsWithMeta: LeaderboardPageEntry[] = ranked.rankings.map((r) => ({
        rank: r.rank,
        alias: aliasByUserId.get(r.userId) ?? 'Unknown',
        totalScore: Math.floor(r.totalScore),
        isSelf: r.userId === play.userId,
        isRival: rivalIds.has(r.userId),
      }));
      leaderboardPages.push({
        leaderboardKey: systemKey,
        label: SCORING_SYSTEM_LABELS[systemKey],
        packName: match.packName,
        chartTitle: match.chartTitle,
        chartArtist: match.chartArtist,
        difficulty: match.difficulty,
        meter: match.meter ?? 0,
        totalParticipants: ranked.totalParticipants,
        rankings: selectNearbyRankings(rankingsWithMeta),
      });
    }

    if (entries.length === 0) continue;

    const imageData: PackResultImageData = {
      chartTitle: match.chartTitle,
      chartArtist: match.chartArtist,
      packName: match.packName,
      difficulty: match.difficulty,
      meter: match.meter ?? 0,
      entries,
    };

    // Summary card first (image 1), then one page per selected leaderboard (images 2..n) -
    // queued in order but all rendered/uploaded concurrently via the shared uploadTasks array.
    uploadTasks.push(upload(`result/play/${play.id}/${match.packId}.png`, renderPackResultImage(imageData)));
    for (const pageData of leaderboardPages) {
      uploadTasks.push(upload(`result/play/${play.id}/${match.packId}-${pageData.leaderboardKey}.png`, renderLeaderboardPage(pageData)));
    }
  }

  return Promise.all(uploadTasks);
}
