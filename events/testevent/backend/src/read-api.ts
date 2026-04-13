import { queryState, queryGsiPaginated, queryStatePaginated, getState, CHART_HASHES } from './shared';

interface FunctionUrlEvent {
  requestContext: { http: { method: string; path: string } };
  queryStringParameters?: Record<string, string>;
  rawPath: string;
}

interface PlayItem {
  type: string;
  playId: number;
  userId: string;
  playerAlias: string;
  chartHash: string;
  songName: string;
  artist: string;
  stepartist: string;
  difficulty: string;
  difficultyRating: number;
  score: number;
  grade: string;
  points: number;
  maxPoints: number;
  timestamp: string;
}

interface BestItem extends PlayItem {
  type: 'BEST';
}

interface UserSummary {
  type: string;
  playerAlias: string;
  totalScore: number;
  totalPoints: number;
  chartsPlayed: number;
  totalPlays: number;
  lastPlayAt: string;
}

interface ChartMeta {
  type: string;
  songName: string;
  artist: string;
  stepartist: string;
  difficulty: string;
  difficultyRating: number;
  bannerUrl: string | null;
  mdBannerUrl: string | null;
  smBannerUrl: string | null;
  bannerVariants?: Record<string, unknown> | null;
  maxPoints: number;
}

function respond(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * GET /activity — Global activity feed (latest scores)
 */
async function getActivity(params: Record<string, string>) {
  const limit = Math.min(parseInt(params.limit || '50', 10) || 50, 100);

  const { items, cursor } = await queryGsiPaginated<PlayItem>('gsi2', 'gsi2pk', 'ACTIVITY', {
    scanForward: false,
    limit,
    cursor: params.cursor,
  });

  return respond(200, { data: items, cursor });
}

/**
 * GET /user/:userId — User summary + personal bests
 */
async function getUser(userId: string) {
  const [summary, bests] = await Promise.all([
    getState<UserSummary>(`USER#${userId}`, '#SUMMARY'),
    queryState<BestItem>(`USER#${userId}`, 'BEST#'),
  ]);

  if (!summary) {
    return respond(404, { error: 'User not found in this event' });
  }

  return respond(200, { summary, bests });
}

/**
 * GET /user/:userId/plays — User's play history
 */
async function getUserPlays(userId: string, params: Record<string, string>) {
  const limit = Math.min(parseInt(params.limit || '50', 10) || 50, 100);

  const { items, cursor } = await queryStatePaginated<PlayItem>(`USER#${userId}`, 'PLAY#', {
    scanForward: false,
    limit,
    cursor: params.cursor,
  });

  return respond(200, { data: items, cursor });
}

/**
 * GET /chart/:chartHash — Chart metadata + best-per-user leaderboard
 * Supports ?sort=score (default, desc) or ?sort=time (newest first)
 */
async function getChartDetail(chartHash: string, params: Record<string, string>) {
  const limit = Math.min(parseInt(params.limit || '50', 10) || 50, 100);
  const sort = params.sort === 'time' ? 'time' : 'score';

  const gsiConfig = sort === 'time'
    ? { index: 'gsi2' as const, pkName: 'gsi2pk', pkValue: `CHARTTIME#${chartHash}` }
    : { index: 'gsi1' as const, pkName: 'gsi1pk', pkValue: `CHARTBEST#${chartHash}` };

  const [meta, result] = await Promise.all([
    getState<ChartMeta>(`CHART#${chartHash}`, '#META'),
    queryGsiPaginated<BestItem>(gsiConfig.index, gsiConfig.pkName, gsiConfig.pkValue, {
      scanForward: false,
      limit,
      cursor: params.cursor,
    }),
  ]);

  return respond(200, { chart: meta || null, data: result.items, cursor: result.cursor, sort });
}

/**
 * GET /leaderboard — Overall event leaderboard (ranked by totalPoints via GSI2)
 */
async function getLeaderboard(params: Record<string, string>) {
  const limit = Math.min(parseInt(params.limit || '50', 10) || 50, 100);

  const { items, cursor } = await queryGsiPaginated<UserSummary>('gsi2', 'gsi2pk', 'LEADERBOARD', {
    scanForward: false,
    limit,
    cursor: params.cursor,
  });

  return respond(200, { data: items, cursor });
}

/**
 * GET /charts — All chart metadata
 */
async function getChartsMeta() {
  const charts: (ChartMeta & { chartHash: string })[] = [];

  for (const chartHash of CHART_HASHES) {
    const meta = await getState<ChartMeta>(`CHART#${chartHash}`, '#META');
    if (meta) {
      charts.push({ ...meta, chartHash });
    }
  }

  return respond(200, { data: charts });
}

/**
 * Simple path-based router for Lambda Function URL.
 */
export async function handler(event: FunctionUrlEvent) {
  const path = event.rawPath || '/';
  const params = event.queryStringParameters || {};

  // Route matching
  const userPlaysMatch = path.match(/^\/user\/([^/]+)\/plays$/);
  if (userPlaysMatch) return getUserPlays(userPlaysMatch[1], params);

  const userMatch = path.match(/^\/user\/([^/]+)$/);
  if (userMatch) return getUser(userMatch[1]);

  const chartMatch = path.match(/^\/chart\/([^/]+)$/);
  if (chartMatch) return getChartDetail(chartMatch[1], params);

  if (path === '/activity') return getActivity(params);
  if (path === '/leaderboard') return getLeaderboard(params);
  if (path === '/charts') return getChartsMeta();

  return respond(404, { error: 'Not found' });
}
