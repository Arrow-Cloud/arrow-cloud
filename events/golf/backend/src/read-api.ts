import { getState, type BestItem } from './shared';

interface FunctionUrlEvent {
  requestContext: { http: { method: string; path: string } };
  queryStringParameters?: Record<string, string>;
  rawPath: string;
}

function respond(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * GET /best?userId=X&chartHash=Y - this user's previous best stroke total on this chart.
 *
 * The only route this rollout needs (see docs/plans/golf-event-result-images.md) - chart.ts's
 * synchronous result-image hook calls this, with a short timeout, to show a delta on the result
 * card. Rank/nearby-standings routes are deferred until that's proven end-to-end.
 */
async function getBest(params: Record<string, string>) {
  const { userId, chartHash } = params;
  if (!userId || !chartHash) {
    return respond(400, { error: 'userId and chartHash are required' });
  }

  const best = await getState<BestItem>(`USER#${userId}`, `BEST#${chartHash}`);
  return respond(200, { previousBestStrokes: best?.totalStrokes ?? null });
}

export async function handler(event: FunctionUrlEvent) {
  const path = event.rawPath || '/';
  const params = event.queryStringParameters || {};

  if (path === '/best') return getBest(params);

  return respond(404, { error: 'Not found' });
}
