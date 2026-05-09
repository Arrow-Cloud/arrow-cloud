import { z } from 'zod';
import { AuthenticatedRouteHandler } from '../utils/types';
import { respond, forbiddenResponse } from '../utils/responses';
import { DEFAULT_LEADERBOARDS } from '../utils/leaderboard';
import { resolveUserPermissions, hasPermission } from '../services/authz';

const BULK_SCORES_MAX_HASHES = 1000;
const PERMISSION_READ_ANY_SCORES = 'scores.read_any';

const RetrieveScoresSchema = z.object({
  chartHashes: z
    .array(z.string().regex(/^[a-f0-9]{16}$/))
    .min(1)
    .max(BULK_SCORES_MAX_HASHES),
  leaderboardIds: z.array(z.number().int().positive()).min(1).optional(),
  userId: z.string().uuid().optional(),
});

type BulkScoreRow = {
  chartHash: string;
  leaderboardId: number;
  data: { score: string; [key: string]: unknown };
  date: Date;
};

/**
 * POST /v1/retrieve-scores
 *
 * Returns the authenticated user's best score on each requested chart, keyed
 * by chartHash then leaderboardId.  Charts (or leaderboards) with no score are
 * omitted.
 *
 * Body:  { chartHashes: string[], leaderboardIds?: number[] }
 * Limit: BULK_SCORES_MAX_HASHES hashes per request
 */
export const getBulkUserScores: AuthenticatedRouteHandler = async (event, prisma) => {
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? '');
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const parsed = RetrieveScoresSchema.safeParse(body);
  if (!parsed.success) {
    return respond(400, { error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { chartHashes, leaderboardIds = DEFAULT_LEADERBOARDS, userId: requestedUserId } = parsed.data;

  let userId = event.user.id;
  if (requestedUserId && requestedUserId !== event.user.id) {
    const perms = await resolveUserPermissions(prisma, event.user.id);
    if (!hasPermission(perms, PERMISSION_READ_ANY_SCORES)) {
      return forbiddenResponse({ error: 'Forbidden', required: PERMISSION_READ_ANY_SCORES });
    }
    userId = requestedUserId;
  }

  // Fetch the user's best play per (chartHash, leaderboardId) directly — no
  // window functions needed since we only care about this user's scores.
  const rows = await prisma.$queryRaw<BulkScoreRow[]>`
    SELECT DISTINCT ON (p."chartHash", pl."leaderboardId")
      p."chartHash"      AS "chartHash",
      pl."leaderboardId" AS "leaderboardId",
      pl.data,
      p."createdAt"      AS date
    FROM "PlayLeaderboard" pl
    JOIN "Play" p ON pl."playId" = p.id
    WHERE p."userId"      = ${userId}
      AND p."chartHash"   = ANY(${chartHashes})
      AND pl."leaderboardId" = ANY(${leaderboardIds})
    ORDER BY p."chartHash", pl."leaderboardId", pl."sortKey" DESC
  `;

  const scores: Record<string, Record<string, { date: string } & Record<string, unknown>>> = {};

  for (const row of rows) {
    const lbId = String(row.leaderboardId);
    if (!scores[row.chartHash]) {
      scores[row.chartHash] = {};
    }
    scores[row.chartHash][lbId] = {
      ...row.data,
      date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
    };
  }

  return respond(200, { scores });
};
