import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient();
export const ddb = DynamoDBDocumentClient.from(client);

export const TABLE_NAME = process.env.STATE_TABLE_NAME!;
export const API_BASE_URL = process.env.API_BASE_URL!;
export const EVENT_SLUG = process.env.EVENT_SLUG!;
export const CHART_HASHES: string[] = JSON.parse(process.env.CHART_HASHES || '[]');

// Scoped to this rollout's "previous best only" read - no rank/nearby-standings yet (see
// docs/plans/golf-event-result-images.md). Mirrors events/testevent/backend/src/shared.ts's
// PlayApiResponse, but with the radar field that endpoint now also exposes (added specifically for
// this event's use) and without the fields testevent needs that golf doesn't (banner variants, etc).
export interface PlayApiResponse {
  id: number;
  createdAt: string;
  user: { id: string; alias: string };
  chart: { hash: string };
  timingData: [number, number | 'Miss'][] | null;
  radar: { Holds: [number, number]; Mines: [number, number]; Rolls: [number, number] } | null;
  /** null when the raw submission could not be read - distinct from false, which means the player
   * genuinely did not pass. See api/src/controllers/play.ts. */
  passed: boolean | null;
  usedAutoplay: boolean | null;
  musicRate: number | null;
  bodyVersion: string | null;
  submissionEngineName: string | null;
  /** Core's verdict for the standard leaderboards. Golf does not simply adopt it - golf is stricter
   * on rate and looser on autoplay - but it is logged when the two disagree, which is how we notice
   * core tightening a rule golf hasn't adopted. */
  standardLeaderboardEligible: boolean | null;
}

/** A denormalized play. Carries only facts about the play itself - course, hole number, par and
 * song name are resolved from courses.ts at read time, so curation changes never need a backfill. */
export interface PlayItem {
  pk: string;
  sk: string;
  type: 'PLAY';
  playId: number;
  userId: string;
  /** Denormalized at score time. Goes stale if the player later renames - see
   * docs/plans/golf-beta-prep.md §4.2, which wants that resolved before beta. */
  playerAlias: string;
  chartHash: string;
  totalStrokes: number;
  noteCount: number;
  timestamp: string;
  /** Whether this play counts: sets a personal best, appears in a public feed, and later ranks on
   * a board. See checkGolfEligibility in api/src/utils/scoring/eligibility.ts for the rule.
   * null means the raw submission was unreadable, so eligibility could not be determined - treated
   * as ineligible for counting, but kept distinguishable so a backfill can resolve it rather than
   * guess. */
  eligible: boolean | null;
  /** Why it didn't count, for debugging without a leaderboard UI to look at. */
  ineligibleReasons?: string[];
  passed: boolean | null;
  musicRate: number | null;
  usedAutoplay: boolean | null;
}

/** Per-note strokes for one play, stored as its own item rather than on the PLAY item above.
 *
 * Both GSIs project ALL (cdk/lib/event-backend-construct.ts), so anything on a GSI-keyed item is
 * copied into both indexes. At the 10k-note ceiling this array is ~39KB, which is fine for a single
 * item (DynamoDB's cap is 400KB) but would put a 50-row activity query at ~1.9MB - past DynamoDB's
 * 1MB query response limit, silently truncating the page. Keeping it on a separate item with no GSI
 * keys means it is invisible to both indexes, so feed queries stay small and callers that actually
 * need the dispersion plot fetch it explicitly (see getNoteStrokes). */
export interface PlayNotesItem {
  pk: string;
  sk: string;
  type: 'PLAY_NOTES';
  playId: number;
  /** Per-tap-note strokes in chronological order, 0 (ace) to 200 (miss/OB). Aggregate mine/hold/roll
   * penalties have no per-note identity in the submission payload, so they are in the PLAY item's
   * totalStrokes but deliberately absent here. */
  noteStrokes: number[];
}

export interface BestItem {
  pk: string;
  sk: string;
  totalStrokes: number;
  playId: number;
  userId: string;
  chartHash: string;
  updatedAt: string;
  /** Denormalized when the best is set, so a board row needs no second lookup per player. Absent on
   * items written before rankings existed; scripts/backfill-golf-play-notes.ts fills them in. Goes
   * stale if the player later renames - docs/plans/golf-beta-prep.md section 4.2. */
  playerAlias?: string;
  /** When the play that set this best was made - the achievedAt used to break exact ties. */
  timestamp?: string;
  /** gsi1: this hole's board, ordered by holeSortKey. Absent until backfilled. */
  gsi1pk?: string;
  gsi1sk?: string;
}

/** One player's standing on one course, derived from their BEST items and indexed into gsi2 so the
 * course board is a single ranged query. Rebuilt from the bests each time rather than incremented,
 * so it can always be recomputed and never drifts from the bests it summarises. */
export interface CourseStandingItem {
  pk: string;
  sk: string;
  type: 'COURSE_STANDING';
  userId: string;
  playerAlias: string;
  courseSlug: string;
  holesCompleted: number;
  /** The course's hole count when this was written - what "complete" meant at the time. If a course
   * gains or loses a hole, standings need re-deriving (the backfill does this). */
  totalHoles: number;
  totalStrokes: number;
  achievedAt: string;
  gsi2pk: string;
  gsi2sk: string;
  updatedAt: string;
}

/** Fetch JSON from the Arrow Cloud API (public endpoints, no auth needed) - same pattern as
 * events/testevent/backend/src/shared.ts's apiFetch. This is the *only* way golf's backend reads
 * core score data - never direct Postgres/S3 access, keeping the isolation boundary a plain HTTP
 * contract (the same shape a third-party event author would have to use). */
export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API ${path} returned ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function getState<T>(pk: string, sk: string): Promise<T | undefined> {
  const result = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk, sk } }));
  return result.Item as T | undefined;
}

/** All items under a partition key whose sort key starts with a prefix. `consistent` reads the base
 * table strongly - needed when reading back something this same invocation just wrote. */
export async function queryState<T>(pk: string, skPrefix: string, options?: { consistent?: boolean }): Promise<T[]> {
  const items: T[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: { ':pk': pk, ':sk': skPrefix },
        ConsistentRead: options?.consistent ?? false,
        ExclusiveStartKey: cursor,
      }),
    );
    items.push(...((result.Items || []) as T[]));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return items;
}

/**
 * Every item in one GSI partition, in index order (ascending sort key), or `truncated: true` if it was
 * bigger than `maxPages` of 1 MB.
 *
 * Reading a whole partition is what lets a board be ranked in memory from one query, with no per-row
 * COUNT queries, and it is cheap at this scale: a best is a couple of hundred bytes, so a page holds
 * thousands of players. The cap exists so a runaway partition degrades (the caller returns no board)
 * rather than turning a result-image request into an unbounded walk.
 */
export async function queryGsiAll<T>(indexName: string, pkName: string, pkValue: string, maxPages = 5): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let cursor: Record<string, unknown> | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: indexName,
        KeyConditionExpression: `${pkName} = :pk`,
        ExpressionAttributeValues: { ':pk': pkValue },
        ScanIndexForward: true,
        ExclusiveStartKey: cursor,
      }),
    );
    items.push(...((result.Items || []) as T[]));
    cursor = result.LastEvaluatedKey;
    if (!cursor) return { items, truncated: false };
  }
  return { items, truncated: true };
}

export async function putState(
  pk: string,
  sk: string,
  data: Record<string, unknown>,
  gsiKeys?: { gsi1pk?: string; gsi1sk?: string; gsi2pk?: string; gsi2sk?: string },
): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { pk, sk, ...data, ...gsiKeys, updatedAt: new Date().toISOString() },
    }),
  );
}

/** Zero-padded strokes, ascending - golf is lower-is-better, so this is the inverse of testevent's
 * scoreToSortKey. Width 7 covers 9,999,999 raw strokes; the worst realistic play is a full miss on
 * every note, which at the 10k-note ceiling assumed for this event is 2,000,000. */
export function strokesToSortKey(totalStrokes: number): string {
  return String(Math.max(0, Math.round(totalStrokes))).padStart(7, '0');
}

export interface PaginatedResult<T> {
  items: T[];
  cursor?: string;
}

/** Query a GSI by partition key, newest/lowest first by default, with an opaque cursor. */
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
  return {
    items: (result.Items || []) as T[],
    cursor: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url') : undefined,
  };
}

/** Fetch per-note strokes for several plays in one round trip, keyed by playId. Missing entries are
 * simply absent - plays ingested before PLAY_NOTES items existed have none (see
 * scripts/backfill-golf-play-notes.ts), and callers must degrade rather than fail. */
export async function getNoteStrokes(plays: { userId: string; chartHash: string; timestamp: string; playId: number }[]): Promise<Map<number, number[]>> {
  const byPlayId = new Map<number, number[]>();
  if (plays.length === 0) return byPlayId;

  const result = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: plays.map((p) => ({ pk: `USER#${p.userId}`, sk: notesSortKey(p.chartHash, p.timestamp, p.playId) })),
        },
      },
    }),
  );

  for (const item of (result.Responses?.[TABLE_NAME] || []) as PlayNotesItem[]) {
    if (Array.isArray(item.noteStrokes)) byPlayId.set(item.playId, item.noteStrokes);
  }
  return byPlayId;
}

/** Sort keys for a play's two items. Both encode chartHash first so a user's history on one hole is
 * a single prefix query. */
export function playSortKey(chartHash: string, timestamp: string, playId: number): string {
  return `PLAY#${chartHash}#${timestamp}#${playId}`;
}

export function notesSortKey(chartHash: string, timestamp: string, playId: number): string {
  return `PLAYNOTES#${chartHash}#${timestamp}#${playId}`;
}

/** GSI2 partition holding every play across every course, newest first - the activity feed. */
export const ACTIVITY_GSI2PK = 'ACTIVITY';

export function activitySortKey(timestamp: string, playId: number): string {
  return `${timestamp}#${playId}`;
}
