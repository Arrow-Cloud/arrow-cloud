import type { SQSHandler, SQSBatchResponse, SQSRecord } from 'aws-lambda';
import {
  apiFetch,
  getState,
  putState,
  playSortKey,
  notesSortKey,
  activitySortKey,
  ACTIVITY_GSI2PK,
  EVENT_SLUG,
  type PlayApiResponse,
  type BestItem,
} from './shared';
import { resolveHole } from './courses';
import { refreshCourseStanding } from './standings';
import { checkGolfEligibility } from '../../../../api/src/utils/scoring/eligibility';
import { calculateGolfStrokes } from '../../../../api/src/utils/scoring/golf';
import { holePartitionKey, holeSortKey } from './rankings';
import { applyUserUpdate, type UserUpdatedMessage } from './user-updates';

interface ScoreSubmissionEvent {
  eventType: string;
  timestamp: string;
  userId: string;
  chartHash: string;
  play: {
    id: string;
    rawTimingDataUrl: string;
  };
}

/**
 * Process a single score submission for golf.
 *
 * Mirrors events/testevent/backend/src/score-processor.ts's shape, but golf strokes aren't a
 * standard leaderboard type, so this fetches the raw timingData/radar from /play/{id} (the same
 * public, unauthenticated endpoint testevent already relies on - not S3/Postgres directly, keeping
 * this Lambda fully isolated from core storage) and computes strokes itself via the shared pure
 * formula, rather than reading a pre-computed score.
 *
 * 1. Fetch play details (timingData + radar) from the public API
 * 2. Compute strokes
 * 3. Write the PLAY item (GSI-keyed into the activity feed) plus its PLAY_NOTES sibling
 * 4. Update BEST only if this total is lower (golf is lower-is-better - inverted from testevent's
 *    score > currentBest.score)
 */
async function processRecord(record: SQSRecord): Promise<void> {
  const snsWrapper = JSON.parse(record.body);
  const message = JSON.parse(snsWrapper.Message);

  // The queue carries two event types (see the subscription filters in event-backend-construct.ts).
  // Anything unrecognised is dropped rather than failed: retrying it three times and dead-lettering it
  // would not make it processable.
  if (message.eventType === 'user-updated') {
    const { updated, skipped } = await applyUserUpdate(message as UserUpdatedMessage);
    console.log(
      `[${EVENT_SLUG}] User updated: user=${message.userId} changed=${(message.changed ?? []).join(',')} items updated=${updated} skipped=${skipped}`,
    );
    return;
  }
  if (message.eventType !== 'score-submitted') {
    console.warn(`[${EVENT_SLUG}] Ignoring unexpected event type ${message.eventType}`);
    return;
  }

  const event: ScoreSubmissionEvent = message;

  console.log(`[${EVENT_SLUG}] Score received: chart=${event.chartHash} user=${event.userId} play=${event.play.id}`);

  const play = await apiFetch<PlayApiResponse>(`/play/${event.play.id}`);

  if (!play.timingData || !play.radar) {
    console.warn(`[${EVENT_SLUG}] No timingData/radar available for play ${event.play.id} - skipping`);
    return;
  }

  const { totalStrokes, noteCount, noteStrokes } = calculateGolfStrokes({ timingData: play.timingData, radar: play.radar });

  const timestamp = play.createdAt;
  const playId = play.id;
  const userId = play.user.id;

  // Resolved only to log it - the play is recorded either way. A hash can be absent here when a
  // course drops a chart (vF3 dropped 5), and discarding the score in that case would lose data we
  // may still want to remap; read paths filter unresolvable holes out instead (see courses.ts).
  const resolved = resolveHole(event.chartHash);
  if (!resolved) {
    console.warn(`[${EVENT_SLUG}] Chart ${event.chartHash} is on no current course - recording play ${playId} anyway, it will not surface in public reads`);
  }

  // Eligibility. The rule is shared source with the core API (same zero-dependency module the
  // stroke formula comes from) so golf and core can't drift apart on what counts. An ineligible
  // play is still recorded - a player's own attempt history keeps it - but it sets no best and
  // never appears publicly.
  //
  // A play whose raw submission couldn't be read has null for every input; treat that as
  // ineligible rather than guessing, and record it as null so a backfill can resolve it later.
  const hasInputs = play.passed !== null && play.musicRate !== null && play.usedAutoplay !== null;
  const check = hasInputs
    ? checkGolfEligibility(
        {
          bodyVersion: play.bodyVersion ?? '0',
          engineName: play.submissionEngineName ?? '',
          musicRate: play.musicRate!,
          usedAutoplay: play.usedAutoplay!,
          passed: play.passed!,
        },
        userId,
      )
    : null;
  const eligible = check?.eligible ?? false;

  if (!check) {
    console.warn(`[${EVENT_SLUG}] Play ${playId} has no readable submission inputs - recording as ineligible (undetermined)`);
  } else if (!eligible) {
    console.log(`[${EVENT_SLUG}] Play ${playId} ineligible (${check.reasons.join(', ')}) - recorded, but sets no best and stays out of public reads`);
  } else if (play.standardLeaderboardEligible === false) {
    // Golf deliberately differs from core (looser on autoplay for allow-listed users, and it skips
    // core's schema-version floor), so a disagreement is expected, not a bug - but it is worth a
    // line, because it is also how we'd notice core tightening a rule golf hasn't adopted.
    console.log(`[${EVENT_SLUG}] Play ${playId} counts for golf but not for core's standard leaderboards`);
  }

  // 1. Write PLAY item - lean. Course, hole number, par and song name are deliberately NOT stored:
  // they're resolved from courses.ts at read time so curation changes need no backfill.
  await putState(
    `USER#${userId}`,
    playSortKey(event.chartHash, timestamp, playId),
    {
      type: 'PLAY',
      playId,
      userId,
      playerAlias: play.user.alias,
      profileImageUrl: play.user.profileImageUrl ?? null,
      chartHash: event.chartHash,
      totalStrokes,
      noteCount,
      timestamp,
      eligible: check ? eligible : null,
      ...(check && !eligible ? { ineligibleReasons: check.reasons } : {}),
      passed: play.passed,
      musicRate: play.musicRate,
      usedAutoplay: play.usedAutoplay,
    },
    // Global activity feed, newest first - but only for an eligible play. Keeping ineligible plays
    // out of the index entirely (rather than filtering them on read) means the feed query never
    // pays to fetch and discard them, and they are common. The item itself is still written, so
    // nothing is lost if a rule changes - only a backfill is needed to re-index.
    //
    // Visibility rules are deliberately NOT applied here: hidden-course and orphaned plays do get
    // indexed and are filtered on read, so un-hiding a course later needs no backfill. Eligibility
    // is different - it is a permanent fact about how the play was performed, not a curation
    // decision that can flip.
    eligible ? { gsi2pk: ACTIVITY_GSI2PK, gsi2sk: activitySortKey(timestamp, playId) } : undefined,
  );

  // 2. Write per-note strokes as a SEPARATE item, with no GSI keys so neither index carries it -
  // see PlayNotesItem in shared.ts for the 1MB query-response reason this isn't on the PLAY item.
  await putState(`USER#${userId}`, notesSortKey(event.chartHash, timestamp, playId), {
    type: 'PLAY_NOTES',
    playId,
    noteStrokes,
  });

  // 3. Check/update personal best - lower strokes is better, and only an eligible play qualifies.
  const currentBest = eligible ? await getState<BestItem>(`USER#${userId}`, `BEST#${event.chartHash}`) : undefined;
  if (eligible && (!currentBest || totalStrokes < currentBest.totalStrokes)) {
    // The hole board (gsi1) is every player's BEST item for this chart, ordered by holeSortKey, so the
    // keys are written with the best rather than in a separate pass. The alias, avatar and achievedAt are
    // denormalized onto it so a board row needs no second lookup per player.
    await putState(
      `USER#${userId}`,
      `BEST#${event.chartHash}`,
      {
        type: 'BEST',
        playId,
        userId,
        chartHash: event.chartHash,
        totalStrokes,
        playerAlias: play.user.alias,
        profileImageUrl: play.user.profileImageUrl ?? null,
        timestamp,
      },
      {
        gsi1pk: holePartitionKey(event.chartHash),
        gsi1sk: holeSortKey({ totalStrokes, achievedAt: timestamp, userId }),
      },
    );

    // A changed best changes the player's standing on its course, so refresh it. Done only when the
    // best actually changed: a play that doesn't beat the best can't move the standing.
    await refreshCourseStanding(userId, play.user.alias, play.user.profileImageUrl ?? null, event.chartHash);
  }
}

export const handler: SQSHandler = async (sqsEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of sqsEvent.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error(`Failed to process record ${record.messageId}:`, error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
