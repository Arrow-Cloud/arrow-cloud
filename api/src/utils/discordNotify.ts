import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export type DiscordNotifyMessage = {
  type: 'admin-event' | 'score-event' | 'system-alert' | 'user-event';
  content?: string; // optional so we can send embed-only messages
  channelId?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
  }>;
};

const queueUrl = process.env.DISCORD_NOTIFY_QUEUE_URL;
const sqs = new SQSClient({});

export async function publishDiscordMessage(msg: DiscordNotifyMessage): Promise<void> {
  if (!queueUrl) {
    // No-op when not configured (e.g., local/dev environments)
    console.warn('DISCORD_NOTIFY_QUEUE_URL is not set; skipping Discord notify');
    return;
  }
  const body = JSON.stringify(msg);
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: body,
    }),
  );
}
