#!/usr/bin/env tsx
/**
 * One-off backfill for golf's PLAY items, bringing everything ingested before the activity feed
 * existed up to the current shape.
 *
 * Three things changed in events/golf/backend/src/score-processor.ts that only apply going forward:
 *   1. PLAY items carry gsi2 keys (gsi2pk=ACTIVITY) - without them a play is invisible to the feed
 *      query entirely, so an un-backfilled table returns an empty panel no matter how many plays
 *      it holds.
 *   2. PLAY items carry playerAlias - the feed needs a display name.
 *   3. A sibling PLAY_NOTES item holds per-note strokes for the dispersion plot.
 *   4. Plays carry an eligibility verdict, and only an eligible play is indexed into the feed or
 *      allowed to set a personal best. Eligible means: passed, musicRate exactly 1, no autoplay
 *      (outside ALLOWED_AUTOPLAY_USERS), and not from the affected DeadSync version range - see
 *      checkGolfEligibility in api/src/utils/scoring/eligibility.ts, which is the same module the
 *      score processor uses, so this can't drift from live ingestion.
 *
 *      Older items were written with no notion of eligibility at all, so some BEST rows were set by
 *      a quit, a rate-modded run or an autoplay run. Phase 2 recomputes every BEST from eligible
 *      plays only and deletes any whose owner has no eligible play on that hole.
 *   5. BEST items carry the hole-board index keys (gsi1), the player's alias and when the best was
 *      set, and every player has a COURSE standing item indexed into gsi2. These are what the
 *      hole and course ranking pages read; without them a board is empty until each player next
 *      improves a best. Phase 2 rewrites every BEST with its keys, and phase 3 rebuilds the
 *      standings from the bests, deleting any whose bests are gone.
 *
 *      Phases 2 and 3 run on every invocation, not only when per-play work remains: they are
 *      derived from the whole table and skip anything already correct, so re-running is cheap.
 *
 * REQUIRES ApiStack to be deployed first: the eligibility inputs are read from GET /play/{id},
 * which only started returning them in the same change as this script. Run against the old API and
 * every play looks undetermined, which this treats as ineligible - so it would strip the whole
 * feed. The script refuses to run if the API doesn't return the new fields.
 *
 * All three are recoverable from the public, unauthenticated GET /play/{id}, which returns the raw
 * submission's timingData and radar plus the player's alias - the same endpoint the score processor
 * itself reads, so this adds no new access path and stays inside the event isolation boundary
 * (never Postgres, never core S3).
 *
 * Dry by default. Pass --apply to write. --limit caps how many plays are processed and, because
 * that leaves eligibility unresolved for the rest, suppresses the BEST reconciliation entirely -
 * use it to smoke-test the per-play writes, then run without it to finish the job.
 *
 * Usage:
 *   npx tsx scripts/backfill-golf-play-notes.ts                 # report only
 *   npx tsx scripts/backfill-golf-play-notes.ts --apply
 *   npx tsx scripts/backfill-golf-play-notes.ts --apply --limit 10   # per-play fields only
 *
 * Needs AWS credentials with read/write on the event-golf-state table. Safe to re-run: every write
 * is an idempotent overwrite of the same keys, and plays already carrying everything are skipped.
 */

import { readFileSync } from 'fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { calculateGolfStrokes } from '../api/src/utils/scoring/golf';
import { checkGolfEligibility } from '../api/src/utils/scoring/eligibility';
import { aggregateCourse, coursePartitionKey, courseSortKey, holePartitionKey, holeSortKey } from '../events/golf/backend/src/rankings';

const TABLE_NAME = process.env.GOLF_STATE_TABLE_NAME || 'event-golf-state';
const REGION = process.env.AWS_REGION || 'us-east-2';
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.arrowcloud.dance';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

interface PlayRow {
  pk: string;
  sk: string;
  type: string;
  playId: number;
  userId: string;
  chartHash: string;
  timestamp: string;
  playerAlias?: string;
  gsi2pk?: string;
  eligible?: boolean | null;
  totalStrokes: number;
}

interface BestRow {
  pk: string;
  sk: string;
  chartHash: string;
  userId: string;
  totalStrokes: number;
  playId: number;
  playerAlias?: string;
  timestamp?: string;
  gsi1pk?: string;
  gsi1sk?: string;
}

interface StandingRow {
  pk: string;
  sk: string;
  gsi2sk?: string;
}

interface CourseConfig {
  slug: string;
  holes: { chartHash: string }[];
}

interface PlayApiResponse {
  id: number;
  user: { id: string; alias: string };
  timingData: [number, number | 'Miss'][] | null;
  radar: { Holds: [number, number]; Mines: [number, number]; Rolls: [number, number] } | null;
  passed: boolean | null;
  usedAutoplay: boolean | null;
  musicRate: number | null;
  bodyVersion: string | null;
  submissionEngineName: string | null;
  standardLeaderboardEligible: boolean | null;
}

async function scanByType<T>(type: string): Promise<T[]> {
  const rows: T[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#t = :type',
        ExpressionAttributeNames: { '#t': 'type' },
        ExpressionAttributeValues: { ':type': type },
        ExclusiveStartKey: cursor,
      }),
    );
    rows.push(...((result.Items || []) as T[]));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return rows;
}

/**
 * Phase 2: recompute every BEST from passed plays only.
 *
 * BEST items predate the pass rule, so a quit or failed stage could have set one - and since golf is
 * lower-is-better and an abandoned run has few notes, a two-second quit produces a *low* total that
 * would beat a real round. Any such BEST is both wrong and flattering, and it feeds the result
 * card's "previous best" delta, so it is worth correcting rather than leaving to age out.
 *
 * A (user, hole) pair with no eligible play has its BEST deleted outright - there is no best to show.
 */
async function reconcileBests(plays: PlayRow[], apply: boolean): Promise<Map<string, PlayRow>> {
  const bests = await scanByType<BestRow>('BEST');

  const bestByKey = new Map<string, PlayRow>();
  for (const play of plays) {
    if (play.eligible !== true) continue;
    const key = `${play.userId}|${play.chartHash}`;
    const current = bestByKey.get(key);
    // A tie goes to the earlier play, which is what the score processor does live (it only replaces a
    // best with strictly fewer strokes) and what ranking assumes (the earlier achiever ranks ahead).
    // Without the timestamp comparison the winner would be whichever play the scan happened to return
    // first, so a re-run could flip it.
    const beatsCurrent =
      !current || play.totalStrokes < current.totalStrokes || (play.totalStrokes === current.totalStrokes && play.timestamp < current.timestamp);
    if (beatsCurrent) bestByKey.set(key, play);
  }

  let deleted = 0;
  const existingByKey = new Map<string, BestRow>();
  for (const best of bests) {
    const key = `${best.userId}|${best.chartHash}`;
    if (!bestByKey.has(key)) {
      if (apply) await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: best.pk, sk: best.sk } }));
      deleted++;
      continue;
    }
    existingByKey.set(key, best);
  }

  // Every surviving best is rewritten in full - corrected values, hole-index keys, alias and
  // timestamp together - unless it is already exactly right, which is what keeps a re-run cheap.
  let alreadyCurrent = 0;
  let corrected = 0;
  let created = 0;
  let reindexed = 0;
  for (const [key, play] of bestByKey) {
    const existing = existingByKey.get(key);
    const wantKey = holeSortKey({ totalStrokes: play.totalStrokes, achievedAt: play.timestamp, userId: play.userId });
    const wantAlias = play.playerAlias ?? 'Unknown';

    if (
      existing &&
      existing.playId === play.playId &&
      existing.totalStrokes === play.totalStrokes &&
      existing.gsi1sk === wantKey &&
      existing.gsi1pk === holePartitionKey(play.chartHash) &&
      existing.playerAlias === wantAlias &&
      existing.timestamp === play.timestamp
    ) {
      alreadyCurrent++;
      continue;
    }
    if (!existing) created++;
    else if (existing.playId !== play.playId || existing.totalStrokes !== play.totalStrokes) corrected++;
    else reindexed++;

    if (apply) {
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk: `USER#${play.userId}`,
            sk: `BEST#${play.chartHash}`,
            type: 'BEST',
            playId: play.playId,
            userId: play.userId,
            chartHash: play.chartHash,
            totalStrokes: play.totalStrokes,
            playerAlias: wantAlias,
            timestamp: play.timestamp,
            gsi1pk: holePartitionKey(play.chartHash),
            gsi1sk: wantKey,
            updatedAt: new Date().toISOString(),
          },
        }),
      );
    }
  }

  console.log(`\nBEST reconciliation (eligible plays only):`);
  console.log(`  already current              : ${alreadyCurrent}`);
  console.log(`  ${apply ? 'corrected' : 'would correct'} (wrong play/score) : ${corrected}`);
  console.log(`  ${apply ? 'indexed' : 'would index'} (keys/alias added)  : ${reindexed}`);
  console.log(`  ${apply ? 'created' : 'would create'} (missing)          : ${created}`);
  console.log(`  ${apply ? 'deleted' : 'would delete'} (no eligible play)  : ${deleted}`);
  return bestByKey;
}

/**
 * Phase 3: rebuild every player's standing on every course from their per-hole bests.
 *
 * Standings are a pure function of the bests (see events/golf/backend/src/standings.ts, which does the
 * same one player at a time as bests change), so this can always be re-derived and never drifts.
 * Hidden courses get standings too: visibility is applied on read, so un-hiding one needs no backfill.
 * A standing whose player no longer has any best on that course is deleted.
 */
async function rebuildStandings(bestByKey: Map<string, PlayRow>, apply: boolean) {
  const courses = (JSON.parse(readFileSync('events/golf/config/courses.json', 'utf-8')) as { courses: CourseConfig[] }).courses;
  const existing = await scanByType<StandingRow & { sk: string }>('COURSE_STANDING');
  const existingByKey = new Map(existing.map((row) => [`${row.pk}|${row.sk}`, row]));

  const bestsByUser = new Map<string, PlayRow[]>();
  for (const play of bestByKey.values()) {
    if (!bestsByUser.has(play.userId)) bestsByUser.set(play.userId, []);
    bestsByUser.get(play.userId)!.push(play);
  }

  const wanted = new Set<string>();
  let alreadyCurrent = 0;
  let written = 0;

  for (const [userId, userBests] of bestsByUser) {
    const alias = userBests.find((b) => b.playerAlias)?.playerAlias ?? 'Unknown';
    for (const course of courses) {
      const aggregate = aggregateCourse(
        userBests.map((b) => ({ chartHash: b.chartHash, totalStrokes: b.totalStrokes, achievedAt: b.timestamp })),
        new Set(course.holes.map((h) => h.chartHash)),
      );
      if (!aggregate) continue;

      const pk = `USER#${userId}`;
      const sk = `COURSE#${course.slug}`;
      wanted.add(`${pk}|${sk}`);
      const totalHoles = course.holes.length;
      const gsi2sk = courseSortKey({ userId, alias, ...aggregate }, totalHoles);
      if (existingByKey.get(`${pk}|${sk}`)?.gsi2sk === gsi2sk) {
        alreadyCurrent++;
        continue;
      }
      written++;
      if (apply) {
        await ddb.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              pk,
              sk,
              type: 'COURSE_STANDING',
              userId,
              playerAlias: alias,
              courseSlug: course.slug,
              holesCompleted: aggregate.holesCompleted,
              totalHoles,
              totalStrokes: aggregate.totalStrokes,
              achievedAt: aggregate.achievedAt,
              gsi2pk: coursePartitionKey(course.slug),
              gsi2sk,
              updatedAt: new Date().toISOString(),
            },
          }),
        );
      }
    }
  }

  let deleted = 0;
  for (const [key, row] of existingByKey) {
    if (wanted.has(key)) continue;
    if (apply) await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: row.pk, sk: row.sk } }));
    deleted++;
  }

  console.log(`\nCourse standings (rebuilt from the bests above):`);
  console.log(`  already current : ${alreadyCurrent}`);
  console.log(`  ${apply ? 'written' : 'would write'}${apply ? '        ' : '    '}: ${written}`);
  console.log(`  ${apply ? 'deleted' : 'would delete'} (stale) : ${deleted}`);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

  console.log(`Table ${TABLE_NAME} (${REGION}) - ${apply ? 'APPLYING' : 'DRY RUN, pass --apply to write'}\n`);

  const plays = await scanByType<PlayRow>('PLAY');

  // Treating "field absent" as "ineligible" would quietly strip every play from the feed, so verify
  // the deployed API actually returns the eligibility inputs before acting on any of them.
  if (plays.length > 0) {
    const probe = await fetch(`${API_BASE_URL}/play/${plays[0].playId}`);
    const body = probe.ok ? ((await probe.json()) as Record<string, unknown>) : {};
    if (!('musicRate' in body) || !('passed' in body)) {
      console.error(`${API_BASE_URL} does not return eligibility fields on GET /play/{id} - deploy ApiStack first.`);
      process.exit(1);
    }
  }
  const todo = plays.filter((p) => !p.gsi2pk || !p.playerAlias || p.eligible === undefined).slice(0, limit);

  console.log(`${plays.length} PLAY items, ${plays.length - todo.length} already current, ${todo.length} to backfill.\n`);
  // No early return when there is nothing to do per play: the BEST and standings phases below are
  // derived from the whole table and still have work after every play is already current.

  let updated = 0;
  let notesWritten = 0;
  let indexed = 0;
  let deindexed = 0;
  let undetermined = 0;
  const reasonCounts: Record<string, number> = {};
  const failures: { playId: number; reason: string }[] = [];

  for (const play of todo) {
    try {
      const res = await fetch(`${API_BASE_URL}/play/${play.playId}`);
      if (!res.ok) throw new Error(`GET /play/${play.playId} -> ${res.status}`);
      const detail = (await res.json()) as PlayApiResponse;

      const alias = detail.user?.alias ?? play.playerAlias ?? 'Unknown';

      // Same shared rule the score processor applies, so a backfilled play and a freshly ingested
      // one can never disagree about whether it counts.
      const hasInputs = detail.passed !== null && detail.musicRate !== null && detail.usedAutoplay !== null;
      const check = hasInputs
        ? checkGolfEligibility(
            {
              bodyVersion: detail.bodyVersion ?? '0',
              engineName: detail.submissionEngineName ?? '',
              musicRate: detail.musicRate!,
              usedAutoplay: detail.usedAutoplay!,
              passed: detail.passed!,
            },
            play.userId,
          )
        : null;
      const eligible = check?.eligible ?? false;
      play.eligible = check ? eligible : null;
      if (check && !eligible) for (const r of check.reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;
      if (!check) undetermined++;

      if (apply) {
        // A passed play gets (or keeps) its feed keys; anything else has them removed, because the
        // write path now keeps non-passes out of the index entirely rather than filtering on read.
        // REMOVE on an absent attribute is a no-op, so this is safe for rows that never had them.
        await ddb.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { pk: play.pk, sk: play.sk },
            ...(eligible
              ? {
                  UpdateExpression:
                    'SET playerAlias = :alias, eligible = :eligible, passed = :passed, musicRate = :rate, usedAutoplay = :auto, gsi2pk = :apk, gsi2sk = :ask REMOVE ineligibleReasons',
                  ExpressionAttributeValues: {
                    ':alias': alias,
                    ':eligible': check ? true : null,
                    ':passed': detail.passed,
                    ':rate': detail.musicRate,
                    ':auto': detail.usedAutoplay,
                    ':apk': 'ACTIVITY',
                    ':ask': `${play.timestamp}#${play.playId}`,
                  },
                }
              : {
                  UpdateExpression:
                    'SET playerAlias = :alias, eligible = :eligible, ineligibleReasons = :reasons, passed = :passed, musicRate = :rate, usedAutoplay = :auto REMOVE gsi2pk, gsi2sk',
                  ExpressionAttributeValues: {
                    ':alias': alias,
                    ':eligible': check ? false : null,
                    ':reasons': check ? check.reasons : ['undetermined'],
                    ':passed': detail.passed,
                    ':rate': detail.musicRate,
                    ':auto': detail.usedAutoplay,
                  },
                }),
          }),
        );
      }
      updated++;
      if (eligible) indexed++;
      else deindexed++;

      // The raw submission can be unreadable (S3 miss - /play/{id} swallows that and returns nulls).
      // Such a play keeps its alias, is recorded as undetermined-therefore-ineligible above, and has
      // no dispersion plot. That's the same degradation the read-api already handles for any play
      // with no PLAY_NOTES sibling, so it is reported but not treated as a failure.
      if (detail.timingData && detail.radar) {
        const { noteStrokes } = calculateGolfStrokes({ timingData: detail.timingData, radar: detail.radar });
        if (apply) {
          await ddb.send(
            new PutCommand({
              TableName: TABLE_NAME,
              Item: {
                pk: play.pk,
                sk: `PLAYNOTES#${play.chartHash}#${play.timestamp}#${play.playId}`,
                type: 'PLAY_NOTES',
                playId: play.playId,
                noteStrokes,
                updatedAt: new Date().toISOString(),
              },
            }),
          );
        }
        notesWritten++;
      } else {
        failures.push({ playId: play.playId, reason: 'no timingData/radar - feed keys written, no dispersion plot' });
      }
    } catch (err) {
      failures.push({ playId: play.playId, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log(`PLAY items ${apply ? 'updated' : 'would update'}: ${updated}`);
  console.log(`  eligible   -> indexed into feed : ${indexed}`);
  console.log(`  ineligible -> kept out of feed  : ${deindexed}`);
  for (const [reason, n] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`       ${reason.padEnd(26)}: ${n}`);
  }
  if (undetermined > 0) console.log(`  undetermined (unreadable submission): ${undetermined}`);
  console.log(`PLAY_NOTES ${apply ? 'written' : 'would write'}: ${notesWritten}`);

  // reconcileBests derives each hole's best from `plays`, but eligibility is only resolved for the
  // items this run actually processed. Under --limit the rest still read as undefined, which is not
  // "ineligible" but "unknown" - and the reconciler cannot tell the difference, so it would delete
  // the BEST of every hole it simply hasn't looked at yet. Skip it rather than act on partial data.
  if (todo.length < plays.filter((p) => !p.gsi2pk || !p.playerAlias || p.eligible === undefined).length) {
    console.log(
      `\nSkipping BEST reconciliation and standings: --limit left ${plays.length - todo.length} play(s) unresolved, and reconciling on partial data would delete bests for holes this run never examined.`,
    );
    return;
  }

  const bestByKey = await reconcileBests(plays, apply);
  await rebuildStandings(bestByKey, apply);
  if (failures.length > 0) {
    console.log(`\n${failures.length} play(s) without full data:`);
    for (const f of failures.slice(0, 20)) console.log(`  ${f.playId}: ${f.reason}`);
    if (failures.length > 20) console.log(`  ...and ${failures.length - 20} more`);
  }
  if (!apply) console.log('\nNothing was written. Re-run with --apply.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
