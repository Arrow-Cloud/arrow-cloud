import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient();
export const ddb = DynamoDBDocumentClient.from(client);

export const TABLE_NAME = process.env.STATE_TABLE_NAME!;
export const API_BASE_URL = process.env.API_BASE_URL!;
export const EVENT_SLUG = process.env.EVENT_SLUG!;
export const EVENT_ID = process.env.EVENT_ID!;
export const CHART_HASHES: string[] = JSON.parse(process.env.CHART_HASHES || '[]');
export const LEADERBOARD_TYPE = process.env.LEADERBOARD_TYPE || 'EX';

// --- API types ---

export interface PlayApiResponse {
  id: number;
  createdAt: string;
  user: { id: string; alias: string; profileImageUrl: string | null };
  chart: {
    hash: string;
    title: string | null;
    artist: string | null;
    stepsType: string | null;
    difficulty: string | null;
    meter: number | null;
    bannerUrl: string | null;
  };
  leaderboards: Array<{
    leaderboard: string;
    data: {
      score: string;
      grade: string;
      judgments: Record<string, number>;
      radar: Record<string, number>;
    };
  }>;
}

export interface ChartApiResponse {
  hash: string;
  songName: string | null;
  artist: string | null;
  stepartist: string | null;
  rating: number | null;
  length: string | null;
  stepsType: string | null;
  difficulty: string | null;
  meter: number | null;
  credit: string | null;
  bannerUrl: string | null;
}

export interface EventChartApiResponse {
  eventChart: {
    id: number;
    eventId: number;
    chartHash: string;
    metadata: { points?: number; [key: string]: unknown };
    chart: {
      hash: string;
      songName: string | null;
      artist: string | null;
      rating: number | null;
      length: string | null;
      stepsType: string | null;
      difficulty: string | null;
      meter: number | null;
      stepartist: string | null;
      credit: string | null;
      bannerUrl: string | null;
      mdBannerUrl: string | null;
      smBannerUrl: string | null;
      bannerVariants?: Record<string, unknown> | null;
    };
  };
}

// --- API fetching ---

/** Fetch JSON from the Arrow Cloud API (public endpoints, no auth needed) */
export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API ${path} returned ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// --- DynamoDB helpers ---

/** Get a single item from the state table */
export async function getState<T>(pk: string, sk: string): Promise<T | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk },
    }),
  );
  return result.Item as T | undefined;
}

/** Put an item into the state table (merges data with pk/sk/updatedAt) */
export async function putState(
  pk: string,
  sk: string,
  data: Record<string, unknown>,
  gsiKeys?: { gsi1pk?: string; gsi1sk?: string; gsi2pk?: string; gsi2sk?: string },
): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk,
        sk,
        ...data,
        ...gsiKeys,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}

/** Query items by partition key with optional sort key prefix */
export async function queryState<T>(pk: string, skPrefix?: string): Promise<T[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: skPrefix ? 'pk = :pk AND begins_with(sk, :sk)' : 'pk = :pk',
      ExpressionAttributeValues: skPrefix ? { ':pk': pk, ':sk': skPrefix } : { ':pk': pk },
    }),
  );
  return (result.Items || []) as T[];
}

/** Query a GSI by partition key, optionally in reverse (newest first) */
export async function queryGsi<T>(indexName: string, pkName: string, pkValue: string, options?: { scanForward?: boolean; limit?: number }): Promise<T[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: indexName,
      KeyConditionExpression: `${pkName} = :pk`,
      ExpressionAttributeValues: { ':pk': pkValue },
      ScanIndexForward: options?.scanForward ?? false,
      Limit: options?.limit,
    }),
  );
  return (result.Items || []) as T[];
}

// --- Paginated query helpers ---

export interface PaginatedResult<T> {
  items: T[];
  cursor?: string;
}

/** Query a GSI with cursor-based pagination */
export async function queryGsiPaginated<T>(
  indexName: string,
  pkName: string,
  pkValue: string,
  options?: { scanForward?: boolean; limit?: number; cursor?: string },
): Promise<PaginatedResult<T>> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: indexName,
      KeyConditionExpression: `${pkName} = :pk`,
      ExpressionAttributeValues: { ':pk': pkValue },
      ScanIndexForward: options?.scanForward ?? false,
      Limit: options?.limit,
      ExclusiveStartKey: options?.cursor ? JSON.parse(Buffer.from(options.cursor, 'base64url').toString()) : undefined,
    }),
  );
  const cursor = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url') : undefined;

  return { items: (result.Items || []) as T[], cursor };
}

/** Query base table with cursor-based pagination */
export async function queryStatePaginated<T>(
  pk: string,
  skPrefix: string,
  options?: { scanForward?: boolean; limit?: number; cursor?: string },
): Promise<PaginatedResult<T>> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': pk, ':sk': skPrefix },
      ScanIndexForward: options?.scanForward ?? false,
      Limit: options?.limit,
      ExclusiveStartKey: options?.cursor ? JSON.parse(Buffer.from(options.cursor, 'base64url').toString()) : undefined,
    }),
  );
  const cursor = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url') : undefined;

  return { items: (result.Items || []) as T[], cursor };
}

// --- GSI sort key helpers ---

/** Pad score (e.g. 98.24) into a 10-digit sortable string: "0000982400" */
export function scoreToSortKey(score: number): string {
  return String(Math.round(Math.max(0, score) * 10000)).padStart(10, '0');
}

/** Pad points into a 10-digit sortable string */
export function pointsToSortKey(points: number): string {
  return String(Math.max(0, Math.round(points))).padStart(10, '0');
}

/** Update only GSI key attributes on an existing item (idempotent — skips if already set) */
export async function updateGsiKeys(pk: string, sk: string, gsiKeys: Record<string, string>): Promise<boolean> {
  const setExprs: string[] = [];
  const values: Record<string, string> = {};
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(gsiKeys)) {
    setExprs.push(`#${key} = :${key}`);
    values[`:${key}`] = value;
    conditions.push(`attribute_not_exists(#${key})`);
  }

  const names: Record<string, string> = {};
  for (const key of Object.keys(gsiKeys)) {
    names[`#${key}`] = key;
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk, sk },
        UpdateExpression: `SET ${setExprs.join(', ')}`,
        ExpressionAttributeValues: values,
        ExpressionAttributeNames: names,
        ConditionExpression: conditions.join(' AND '),
      }),
    );
    return true;
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

/** Unconditionally set attributes on an existing item */
export async function updateAttributes(pk: string, sk: string, attrs: Record<string, unknown>): Promise<void> {
  const setExprs: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};

  for (const [key, value] of Object.entries(attrs)) {
    setExprs.push(`#${key} = :${key}`);
    values[`:${key}`] = value;
    names[`#${key}`] = key;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk },
      UpdateExpression: `SET ${setExprs.join(', ')}`,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
    }),
  );
}

// --- Score extraction ---

/** Extract the score for our configured leaderboard type from a play's leaderboard entries */
export function extractScore(leaderboards: PlayApiResponse['leaderboards']): { score: number; grade: string } | undefined {
  const entry = leaderboards.find((lb) => lb.leaderboard === LEADERBOARD_TYPE);
  if (!entry) return undefined;
  return {
    score: parseFloat(entry.data.score),
    grade: entry.data.grade,
  };
}

// --- Points calculation ---

/**
 * Calculate points awarded for a score on a chart worth `maxPoints`.
 *
 * Uses an exponential curve so that small improvements at the top end
 * are worth progressively more. A score of 100.00 earns full points;
 * a score of 0 earns 0.
 *
 * Formula: points = maxPoints * (score / 100) ^ exponent
 *
 * With exponent=5, the curve is:
 *   90% score → ~59% of points
 *   95% score → ~77% of points
 *   99% score → ~95% of points
 *  100% score → 100% of points
 */
export function calculatePoints(score: number, maxPoints: number, exponent = 5): number {
  if (maxPoints <= 0 || score <= 0) return 0;
  const ratio = Math.min(score, 100) / 100;
  return Math.round(ratio ** exponent * maxPoints);
}

// --- Shared domain types ---

export interface ChartMeta {
  songName: string;
  artist: string;
  stepartist: string;
  stepsType: string | null;
  difficulty: string;
  difficultyRating: number;
  bannerUrl: string | null;
  mdBannerUrl: string | null;
  smBannerUrl: string | null;
  bannerVariants?: Record<string, unknown> | null;
  maxPoints: number;
}

export interface BestItem {
  pk: string;
  sk: string;
  score: number;
  points: number;
  chartHash?: string;
  userId?: string;
  timestamp?: string;
  playerAlias?: string;
}

// --- Backfill API types ---

export interface BackfillChart {
  chartHash: string;
  songName: string;
  artist: string;
  stepartist: string;
  stepsType: string | null;
  difficulty: string;
  meter: number;
  bannerUrl: string | null;
  mdBannerUrl: string | null;
  smBannerUrl: string | null;
  bannerVariants?: Record<string, unknown> | null;
  maxPoints: number;
}

export interface BackfillPlay {
  playId: number;
  userId: string;
  playerAlias: string;
  chartHash: string;
  score: number;
  grade: string;
  createdAt: string;
}

export interface BackfillApiResponse {
  charts: BackfillChart[];
  plays: BackfillPlay[];
}

// --- Shared record builders ---

/** Build the data fields for a denormalized PLAY item */
export function buildPlayData(
  play: { playId: number; userId: string; playerAlias: string; score: number; grade: string; timestamp: string },
  chartHash: string,
  chartMeta: ChartMeta,
): { data: Record<string, unknown>; gsiKeys: { gsi1pk: string; gsi1sk: string; gsi2pk: string; gsi2sk: string } } {
  const points = calculatePoints(play.score, chartMeta.maxPoints);
  return {
    data: {
      type: 'PLAY',
      playId: play.playId,
      userId: play.userId,
      playerAlias: play.playerAlias,
      chartHash,
      songName: chartMeta.songName,
      artist: chartMeta.artist,
      stepartist: chartMeta.stepartist,
      stepsType: chartMeta.stepsType,
      difficulty: chartMeta.difficulty,
      difficultyRating: chartMeta.difficultyRating,
      bannerUrl: chartMeta.bannerUrl,
      mdBannerUrl: chartMeta.mdBannerUrl,
      smBannerUrl: chartMeta.smBannerUrl,
      bannerVariants: chartMeta.bannerVariants || null,
      score: play.score,
      grade: play.grade,
      points,
      maxPoints: chartMeta.maxPoints,
      timestamp: play.timestamp,
    },
    gsiKeys: {
      gsi1pk: `CHART#${chartHash}`,
      gsi1sk: `${play.timestamp}#${play.playId}`,
      gsi2pk: 'ACTIVITY',
      gsi2sk: `${play.timestamp}#${play.playId}`,
    },
  };
}

/** Build the data fields for a denormalized BEST item */
export function buildBestData(
  play: { playId: number; userId: string; playerAlias: string; score: number; grade: string; timestamp: string },
  chartHash: string,
  chartMeta: ChartMeta,
): { data: Record<string, unknown>; gsiKeys: { gsi1pk: string; gsi1sk: string; gsi2pk: string; gsi2sk: string } } {
  const points = calculatePoints(play.score, chartMeta.maxPoints);
  return {
    data: {
      type: 'BEST',
      playId: play.playId,
      userId: play.userId,
      chartHash,
      songName: chartMeta.songName,
      artist: chartMeta.artist,
      stepartist: chartMeta.stepartist,
      stepsType: chartMeta.stepsType,
      difficulty: chartMeta.difficulty,
      difficultyRating: chartMeta.difficultyRating,
      bannerUrl: chartMeta.bannerUrl,
      mdBannerUrl: chartMeta.mdBannerUrl,
      smBannerUrl: chartMeta.smBannerUrl,
      bannerVariants: chartMeta.bannerVariants || null,
      score: play.score,
      grade: play.grade,
      points,
      maxPoints: chartMeta.maxPoints,
      timestamp: play.timestamp,
      playerAlias: play.playerAlias,
    },
    gsiKeys: {
      gsi1pk: `CHARTBEST#${chartHash}`,
      gsi1sk: `${scoreToSortKey(play.score)}#${play.userId}`,
      gsi2pk: `CHARTTIME#${chartHash}`,
      gsi2sk: `${play.timestamp}#${play.userId}`,
    },
  };
}

/** Fetch chart metadata from DynamoDB cache, falling back to the event chart API */
export async function getChartMeta(chartHash: string): Promise<ChartMeta> {
  const cached = await getState<ChartMeta>(`CHART#${chartHash}`, '#META');
  if (cached?.songName && 'mdBannerUrl' in cached && 'stepsType' in cached) return cached;

  const { eventChart } = await apiFetch<EventChartApiResponse>(`/event/${EVENT_ID}/chart/${chartHash}`);

  const chart = eventChart.chart;
  const meta: ChartMeta = {
    songName: chart.songName || 'Unknown',
    artist: chart.artist || 'Unknown',
    stepartist: chart.stepartist || chart.credit || 'Unknown',
    stepsType: chart.stepsType || null,
    difficulty: chart.difficulty || 'Unknown',
    difficultyRating: chart.meter ?? chart.rating ?? 0,
    bannerUrl: chart.bannerUrl || null,
    mdBannerUrl: chart.mdBannerUrl || null,
    smBannerUrl: chart.smBannerUrl || null,
    bannerVariants: chart.bannerVariants || null,
    maxPoints: (eventChart.metadata as { points?: number }).points || 0,
  };

  await putState(`CHART#${chartHash}`, '#META', { ...meta, type: 'CHART_META' });
  return meta;
}

/** Recompute a user's summary from their personal bests */
export async function recomputeUserSummary(userId: string, playerAlias: string): Promise<void> {
  const bests = await queryState<BestItem>(`USER#${userId}`, 'BEST#');

  let totalScore = 0;
  let totalPoints = 0;
  let chartsPlayed = 0;

  for (const best of bests) {
    totalScore += best.score || 0;
    totalPoints += best.points || 0;
    chartsPlayed++;
  }

  const plays = await queryState<{ pk: string }>(`USER#${userId}`, 'PLAY#');

  await putState(
    `USER#${userId}`,
    '#SUMMARY',
    {
      type: 'USER_SUMMARY',
      userId,
      playerAlias,
      totalScore,
      totalPoints,
      chartsPlayed,
      totalPlays: plays.length,
      lastPlayAt: new Date().toISOString(),
    },
    {
      gsi2pk: 'LEADERBOARD',
      gsi2sk: `${pointsToSortKey(totalPoints)}#${userId}`,
    },
  );
}
