import { APIGatewayProxyResult } from 'aws-lambda';
import { AuthenticatedEvent } from '../utils/types';
import { PrismaClient } from '../../prisma/generated/client';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { respond } from '../utils/responses';

const S3_BUCKET = process.env.S3_BUCKET_PACKS || 'arrow-cloud-packs';

type DuplicateDecision = 'confirm' | 'deny';

export async function getPackUploadUrl(event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { filename, contentType, packName, duplicateDecision } = body as {
      filename?: string;
      contentType?: string;
      packName?: string;
      duplicateDecision?: DuplicateDecision;
    };

    if (!filename) {
      return respond(400, { error: 'Filename is required' });
    }

    // Validate file type
    if (!filename.endsWith('.zip')) {
      return respond(400, { error: 'Only .zip files are allowed' });
    }

    const derivedPackName = filename.replace(/\.zip$/i, '').trim();
    const trimmedPackName = String(packName || derivedPackName).trim();
    if (!trimmedPackName) {
      return respond(400, { error: 'Pack name is required' });
    }

    if (duplicateDecision && !['confirm', 'deny'].includes(duplicateDecision)) {
      return respond(400, { error: 'Invalid duplicateDecision. Must be confirm or deny.' });
    }

    const existingPack = await prisma.pack.findFirst({
      where: {
        name: {
          equals: trimmedPackName,
          mode: 'insensitive',
        },
      },
      select: { id: true, name: true },
    });

    const duplicateSummary = {
      existingPack: existingPack
        ? {
            id: existingPack.id,
            name: existingPack.name,
          }
        : null,
      duplicateDetected: !!existingPack,
    };

    const hasDuplicate = !!existingPack;

    if (hasDuplicate && !duplicateDecision) {
      return respond(409, {
        error: 'Potential duplicate pack detected',
        requiresConfirmation: true,
        allowedActions: ['confirm', 'deny'],
        duplicateSummary,
      });
    }

    if (hasDuplicate && duplicateDecision === 'deny') {
      return respond(200, {
        cancelled: true,
        duplicateSummary,
      });
    }

    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    const uploadKey = `pack-uploads/${Date.now()}_${filename}`;

    // Generate pre-signed URL for PUT operation
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: uploadKey,
      ContentType: contentType || 'application/zip',
      Metadata: {
        'uploaded-by': event.user.id,
        'original-filename': filename,
        'pack-name': trimmedPackName,
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour expiry

    console.log('Generated upload URL:', {
      bucket: S3_BUCKET,
      key: uploadKey,
      expiresIn: 3600,
      urlHost: new URL(uploadUrl).host,
    });

    const response = {
      uploadUrl,
      uploadKey,
      expiresIn: 3600, // 1 hour
      duplicateSummary,
    };
    return respond(200, response);
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return respond(500, { error: 'Failed to generate upload URL' });
  }
}

// todo: figure out async handling (new lambda triggered by s3? this method not currently used)
// export async function processUploadedPack(event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
// }
