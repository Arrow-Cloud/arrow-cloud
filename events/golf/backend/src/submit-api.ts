import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const BUCKET_NAME = process.env.SUBMISSIONS_BUCKET_NAME!;
const STATE_TABLE_NAME = process.env.STATE_TABLE_NAME!;
const PRESIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

// Only accept zip archives — chart packages are always zips
const ALLOWED_CONTENT_TYPES = new Set(['application/zip', 'application/x-zip-compressed', 'application/x-zip', 'application/octet-stream']);

interface FunctionUrlEvent {
  requestContext: { http: { method: string; path: string } };
  headers?: Record<string, string>;
  body?: string;
}

function respond(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler(event: FunctionUrlEvent) {
  const { method, path } = event.requestContext.http;

  if (method === 'POST' && path === '/upload-url') {
    let body: { filename?: unknown; contentType?: unknown; userId?: unknown; userAlias?: unknown };
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return respond(400, { error: 'Invalid JSON body' });
    }

    const { filename, contentType, userId, userAlias } = body;

    console.log(
      '[submit-api] body received',
      JSON.stringify({
        filename,
        contentType,
        hasUserId: userId !== undefined,
        userIdType: typeof userId,
        hasUserAlias: userAlias !== undefined,
        userAliasType: typeof userAlias,
      }),
    );

    if (typeof filename !== 'string' || !filename.trim()) {
      return respond(400, { error: 'filename is required' });
    }

    if (typeof contentType !== 'string' || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      return respond(400, { error: `Unsupported content type: ${contentType}` });
    }

    // Strip path components and sanitize — keep only safe characters
    const safeName = filename
      .split(/[\\/]/)
      .pop()!
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 200);

    const key = `submissions/${Date.now()}-${randomUUID()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    });

    // Write submission record to DynamoDB so the notifier can read submitter identity
    await dynamo.send(
      new PutCommand({
        TableName: STATE_TABLE_NAME,
        Item: {
          pk: `SUBMISSION#${key}`,
          sk: 'METADATA',
          userId: typeof userId === 'string' ? userId.trim() : 'unknown',
          userAlias: typeof userAlias === 'string' ? userAlias.trim() : 'unknown',
          filename: safeName,
          submittedAt: new Date().toISOString(),
        },
      }),
    );

    return respond(200, { uploadUrl, key });
  }

  return respond(404, { error: 'Not found' });
}
