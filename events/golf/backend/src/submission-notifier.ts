import type { S3Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

const STATE_TABLE_NAME = process.env.STATE_TABLE_NAME!;
const DISCORD_NOTIFY_QUEUE_URL = process.env.DISCORD_NOTIFY_QUEUE_URL!;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID!;
const SUBMISSIONS_CDN_DOMAIN = process.env.SUBMISSIONS_CDN_DOMAIN!;

// Discord green
const EMBED_COLOR = 0x57f287;

export const handler: S3Handler = async (event) => {
  console.log('submission-notifier invoked', { recordCount: event.Records.length });

  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const sizeBytes = record.s3.object.size;
    const sizeKb = (sizeBytes / 1024).toFixed(1);

    console.log('processing record', { key, sizeBytes });

    // Strip the submissions/<timestamp>-<uuid>- prefix for a readable display name
    const filename = key.split('/').pop() ?? key;
    const displayName = filename.replace(/^\d+-[0-9a-f-]+-/i, '') || filename;

    // Read submitter identity from DynamoDB
    console.log('reading submission record from DynamoDB', { key });
    const { Item: submission } = await dynamo.send(
      new GetCommand({
        TableName: STATE_TABLE_NAME,
        Key: { pk: `SUBMISSION#${key}`, sk: 'METADATA' },
      }),
    );
    console.log('submission record', submission);
    const userId = submission?.userId ?? 'unknown';
    const userAlias = submission?.userAlias ?? 'unknown';

    const downloadUrl = `https://${SUBMISSIONS_CDN_DOMAIN}/${key}`;

    const message = {
      type: 'admin-event',
      channelId: DISCORD_CHANNEL_ID,
      embeds: [
        {
          title: 'New Golf Chart Submission',
          url: downloadUrl,
          color: EMBED_COLOR,
          fields: [
            { name: 'Submitted by', value: `[${userAlias}](https://arrowcloud.dance/user/${userId})`, inline: false },
            { name: 'File', value: `\`${displayName}\``, inline: false },
            { name: 'Size', value: `${sizeKb} KB`, inline: true },
            { name: 'Download', value: `[Download zip](${downloadUrl})`, inline: false },
          ],
        },
      ],
    };

    console.log('sending SQS message', { queueUrl: DISCORD_NOTIFY_QUEUE_URL, channelId: DISCORD_CHANNEL_ID });
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: DISCORD_NOTIFY_QUEUE_URL,
        MessageBody: JSON.stringify(message),
      }),
    );
    console.log('SQS message sent successfully');
  }
};
