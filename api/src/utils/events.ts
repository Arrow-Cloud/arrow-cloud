import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { assetS3UrlToCloudFrontUrl } from './s3';

const snsClient = new SNSClient();

// Event type constants
export const EVENT_TYPES = {
  SCORE_SUBMITTED: 'score-submitted',
  SCORE_DELETED: 'score-deleted',
  USER_UPDATED: 'user-updated',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface ScoreSubmissionEvent {
  eventType: typeof EVENT_TYPES.SCORE_SUBMITTED;
  timestamp: string;
  userId: string;
  chartHash: string;
  play: {
    id: string;
    rawTimingDataUrl: string;
  };
}

/**
 * Publishes a score submission event to the SNS topic
 */
export async function publishScoreSubmissionEvent(event: ScoreSubmissionEvent): Promise<void> {
  const topicArn = process.env.SCORE_SUBMISSION_TOPIC_ARN;

  if (!topicArn) {
    console.warn('SCORE_SUBMISSION_TOPIC_ARN not configured, skipping event publication');
    return;
  }

  try {
    const command = new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(event),
      MessageAttributes: {
        eventType: {
          DataType: 'String',
          StringValue: event.eventType,
        },
        userId: {
          DataType: 'String',
          StringValue: event.userId,
        },
        chartHash: {
          DataType: 'String',
          StringValue: event.chartHash,
        },
        timestamp: {
          DataType: 'String',
          StringValue: event.timestamp,
        },
      },
    });

    await snsClient.send(command);
  } catch (error) {
    console.error('Failed to publish score submission event:', error);
  }
}

export interface ScoreDeletedEvent {
  eventType: typeof EVENT_TYPES.SCORE_DELETED;
  timestamp: string; // When the delete happened
  userId: string;
  chartHash: string;
  playTimestamp: string; // When the original play was created (needed to find the session)
  stepsHit: number; // Steps to subtract from user stats
  meter: number | null; // Chart difficulty for session adjustment
  wasQuad?: boolean; // Whether the deleted play was a quad (100% ITG)
  wasQuint?: boolean; // Whether the deleted play was a quint (100% EX)
  wasHex?: boolean; // Whether the deleted play was a hex (100% H.EX)
}

/**
 * Publishes a score deleted event to the SNS topic
 */
export async function publishScoreDeletedEvent(event: ScoreDeletedEvent): Promise<void> {
  const topicArn = process.env.SCORE_SUBMISSION_TOPIC_ARN;

  if (!topicArn) {
    console.warn('SCORE_SUBMISSION_TOPIC_ARN not configured, skipping event publication');
    return;
  }

  try {
    const command = new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(event),
      MessageAttributes: {
        eventType: {
          DataType: 'String',
          StringValue: event.eventType,
        },
        userId: {
          DataType: 'String',
          StringValue: event.userId,
        },
        chartHash: {
          DataType: 'String',
          StringValue: event.chartHash,
        },
        timestamp: {
          DataType: 'String',
          StringValue: event.timestamp,
        },
      },
    });

    await snsClient.send(command);
  } catch (error) {
    console.error('Failed to publish score deleted event:', error);
  }
}

/** The user fields that other systems (event backends) denormalize, so a change to any of them is worth an event. */
export type UserUpdatedField = 'alias' | 'profileImageUrl' | 'banned';

/**
 * A user's public identity changed. The payload is a **snapshot** of the user's current values, not a delta:
 * `changed` says what moved this time, but `user` always carries everything. That lets a consumer apply it
 * blindly and idempotently, and makes a dropped or reordered event self-healing - the next one overwrites the
 * stale state. `user.updatedAt` is the row's own version, for a consumer that wants to ignore an older event
 * that arrives after a newer one.
 */
export interface UserUpdatedEvent {
  eventType: typeof EVENT_TYPES.USER_UPDATED;
  timestamp: string; // When the event was published
  userId: string;
  changed: UserUpdatedField[];
  user: {
    alias: string;
    /** A ready-to-use CloudFront URL (what the public API returns), or null for no avatar. */
    profileImageUrl: string | null;
    banned: boolean;
    /** The user row's updatedAt, ISO 8601. */
    updatedAt: string;
  };
}

/** The columns of a user row a UserUpdatedEvent is built from. `profileImageUrl` is the stored s3:// form. */
export interface UserUpdatedSource {
  id: string;
  alias: string;
  profileImageUrl: string | null;
  banned?: boolean | null;
  updatedAt: Date | string;
}

/** Builds the event from a user row as it is after the change. Pure, so the payload shape can be tested. */
export function buildUserUpdatedEvent(user: UserUpdatedSource, changed: UserUpdatedField[]): UserUpdatedEvent {
  return {
    eventType: EVENT_TYPES.USER_UPDATED,
    timestamp: new Date().toISOString(),
    userId: user.id,
    changed,
    user: {
      alias: user.alias,
      profileImageUrl: assetS3UrlToCloudFrontUrl(user.profileImageUrl),
      banned: Boolean(user.banned),
      updatedAt: new Date(user.updatedAt).toISOString(),
    },
  };
}

/**
 * Publishes a user updated event to the SNS topic. Like the other publishers, a failure is logged and swallowed:
 * the profile change has already been saved, and failing the request over a downstream notification would be worse
 * than a stale name on a leaderboard (which the next event, or a backfill, corrects).
 */
export async function publishUserUpdatedEvent(event: UserUpdatedEvent): Promise<void> {
  const topicArn = process.env.SCORE_SUBMISSION_TOPIC_ARN;

  if (!topicArn) {
    console.warn('SCORE_SUBMISSION_TOPIC_ARN not configured, skipping event publication');
    return;
  }

  try {
    const command = new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(event),
      // No chartHash: this event is about a user, not a play. Subscribers filter on eventType.
      MessageAttributes: {
        eventType: {
          DataType: 'String',
          StringValue: event.eventType,
        },
        userId: {
          DataType: 'String',
          StringValue: event.userId,
        },
        timestamp: {
          DataType: 'String',
          StringValue: event.timestamp,
        },
      },
    });

    await snsClient.send(command);
  } catch (error) {
    console.error('Failed to publish user updated event:', error);
  }
}
