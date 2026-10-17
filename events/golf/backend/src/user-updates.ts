import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, queryState, TABLE_NAME } from './shared';

/**
 * Applying a `user-updated` event from core (api/src/utils/events.ts, UserUpdatedEvent).
 *
 * A player's alias and avatar are denormalized onto three kinds of item under `USER#<id>` - every PLAY,
 * every BEST and every COURSE_STANDING - so a board or feed row needs no second lookup. This brings them
 * all up to date after a rename or an avatar change. The index keys (gsi1sk, gsi2sk) are built from
 * strokes, times and ids, never the alias, so a plain attribute update is enough: nothing moves on a board.
 *
 * Ban state is deliberately ignored; golf has no banned players to hide.
 *
 * Safe to redeliver and to receive out of order. Each item records the `updatedAt` of the user row it was
 * last updated from (`identityAt`), and an event only applies where it is not older than that. Items
 * written at score time carry no `identityAt` and always accept an event: they were written from a fresh
 * read of the player, so the only way a late event could hurt them is a delay longer than the gap between
 * a rename and the player's next play, and the next event or play would repair it.
 */

export interface UserUpdatedMessage {
  eventType: string;
  userId: string;
  changed?: string[];
  user: {
    alias: string;
    profileImageUrl: string | null;
    banned?: boolean;
    updatedAt: string;
  };
}

/** Sort-key prefixes of the items that carry the alias and avatar. PLAYNOTES items carry neither. */
const IDENTITY_SK_PREFIXES = ['PLAY#', 'BEST#', 'COURSE#'];

/** How many item updates run at once. A prolific player has a few hundred plays; this is plenty. */
const UPDATE_CONCURRENCY = 10;

export interface UserUpdateResult {
  updated: number;
  /** Items left alone because they already reflect a newer version of the user. */
  skipped: number;
}

export async function applyUserUpdate(event: UserUpdatedMessage): Promise<UserUpdateResult> {
  const { userId, user } = event;
  const pk = `USER#${userId}`;

  const keys: { sk: string }[] = [];
  for (const prefix of IDENTITY_SK_PREFIXES) {
    keys.push(...(await queryState<{ sk: string }>(pk, prefix)));
  }

  const result: UserUpdateResult = { updated: 0, skipped: 0 };
  for (let i = 0; i < keys.length; i += UPDATE_CONCURRENCY) {
    const batch = keys.slice(i, i + UPDATE_CONCURRENCY);
    const outcomes = await Promise.all(batch.map((item) => updateIdentity(pk, item.sk, user)));
    for (const applied of outcomes) {
      if (applied) result.updated++;
      else result.skipped++;
    }
  }
  return result;
}

/** True if the item was updated, false if it already held a newer version of the user. */
async function updateIdentity(pk: string, sk: string, user: UserUpdatedMessage['user']): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk, sk },
        UpdateExpression: 'SET playerAlias = :alias, profileImageUrl = :image, identityAt = :at',
        // attribute_exists(pk): never create an item the query above saw deleted in the meantime.
        // ISO 8601 UTC strings of one format compare correctly as strings.
        ConditionExpression: 'attribute_exists(pk) AND (attribute_not_exists(identityAt) OR identityAt <= :at)',
        ExpressionAttributeValues: { ':alias': user.alias, ':image': user.profileImageUrl, ':at': user.updatedAt },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}
