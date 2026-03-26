import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient();

// Event type constants
export const EVENT_TYPES = {
  SCORE_SUBMITTED: 'score-submitted',
  SCORE_DELETED: 'score-deleted',
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
