import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

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
}

export interface BestItem {
  pk: string;
  sk: string;
  totalStrokes: number;
  playId: number;
  userId: string;
  chartHash: string;
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

export async function putState(pk: string, sk: string, data: Record<string, unknown>): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { pk, sk, ...data, updatedAt: new Date().toISOString() },
    }),
  );
}
