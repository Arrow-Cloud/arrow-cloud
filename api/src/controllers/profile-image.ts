import { APIGatewayProxyResult } from 'aws-lambda';
import { AuthenticatedEvent } from '../utils/types';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { respond, internalServerErrorResponse } from '../utils/responses';
import { PrismaClient } from '../../prisma/generated/client';
import { assetS3UrlToCloudFrontUrl } from '../utils/s3';
import { z } from 'zod';

const S3_BUCKET_ASSETS = process.env.S3_BUCKET_ASSETS || 'arrow-cloud-assets';

const GetProfileImageUploadUrlRequestSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  contentType: z.string().min(1, 'Content type is required'),
});

const UpdateProfileImageRequestSchema = z.object({
  profileImageUrl: z.string().url('Valid URL is required'),
});

// Helper function to extract S3 key from S3 URL
function extractS3KeyFromUrl(s3Url: string): string | null {
  if (!s3Url.startsWith('s3://')) {
    return null;
  }

  // Extract key from s3://bucket-name/key format
  const urlParts = s3Url.replace('s3://', '').split('/');
  if (urlParts.length < 2) {
    return null;
  }

  // Remove bucket name and join the rest as the key
  return urlParts.slice(1).join('/');
}

// Helper function to delete an S3 object
async function deleteS3Object(s3Client: S3Client, bucket: string, key: string): Promise<void> {
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await s3Client.send(deleteCommand);
    console.log('Successfully deleted S3 object:', { bucket, key });
  } catch (error) {
    console.error('Error deleting S3 object:', { bucket, key, error });
    // Don't throw error - we don't want to fail the update if deletion fails
  }
}

export async function getProfileImageUploadUrl(event: AuthenticatedEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    let requestBody: unknown;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    // Validate request using Zod
    const validationResult = GetProfileImageUploadUrlRequestSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return respond(422, { error: 'Validation failed', issues: validationResult.error.issues });
    }

    const { filename, contentType } = validationResult.data;

    // Validate file type - only allow common image formats
    const allowedContentTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

    if (!allowedContentTypes.includes(contentType.toLowerCase())) {
      return respond(400, { error: 'Only image files (JPEG, PNG, GIF, WebP) are allowed' });
    }

    // Validate filename extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const fileExtension = filename.toLowerCase().substring(filename.lastIndexOf('.'));

    if (!allowedExtensions.includes(fileExtension)) {
      return respond(400, { error: 'Only image files with extensions .jpg, .jpeg, .png, .gif, .webp are allowed' });
    }

    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

    // Generate unique upload key with user ID and timestamp
    const timestamp = Date.now();
    const uploadKey = `profile-images/${event.user.id}/${timestamp}_${filename}`;

    // Generate pre-signed URL for PUT operation
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_ASSETS,
      Key: uploadKey,
      ContentType: contentType,
      CacheControl: 'max-age=31536000', // Cache for 1 year
      Metadata: {
        'uploaded-by': event.user.id,
        'original-filename': filename,
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour expiry

    console.log('Generated profile image upload URL:', {
      bucket: S3_BUCKET_ASSETS,
      key: uploadKey,
      expiresIn: 3600,
      userId: event.user.id,
      urlHost: new URL(uploadUrl).host,
    });

    const response = {
      uploadUrl,
      uploadKey,
      expiresIn: 3600, // 1 hour
      // Return the final S3 URL that will be stored in the database
      profileImageUrl: `s3://${S3_BUCKET_ASSETS}/${uploadKey}`,
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error generating profile image upload URL:', error);
    return internalServerErrorResponse();
  }
}

export async function updateProfileImage(event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    let requestBody: unknown;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    // Validate request using Zod
    const validationResult = UpdateProfileImageRequestSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return respond(422, { error: 'Validation failed', issues: validationResult.error.issues });
    }

    const { profileImageUrl } = validationResult.data;

    // Validate that the URL is for the correct user's profile images
    if (!profileImageUrl.includes(`profile-images/${event.user.id}/`)) {
      return respond(403, { error: 'Invalid profile image URL for this user' });
    }

    // Delete previous profile image if it exists
    if (event.user.profileImageUrl) {
      const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      const previousImageKey = extractS3KeyFromUrl(event.user.profileImageUrl);

      if (previousImageKey) {
        await deleteS3Object(s3Client, S3_BUCKET_ASSETS, previousImageKey);
      }
    }

    // Update user's profile image URL
    const updatedUser = await prisma.user.update({
      where: { id: event.user.id },
      data: { profileImageUrl },
      select: {
        id: true,
        email: true,
        alias: true,
        profileImageUrl: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log('Updated profile image for user:', {
      userId: event.user.id,
      alias: event.user.alias,
      profileImageUrl,
      deletedPreviousImage: !!event.user.profileImageUrl,
    });

    return respond(200, {
      user: {
        ...updatedUser,
        profileImageUrl: updatedUser.profileImageUrl ? assetS3UrlToCloudFrontUrl(updatedUser.profileImageUrl) : null,
      },
      message: 'Profile image updated successfully',
    });
  } catch (error) {
    console.error('Error updating profile image:', error);
    return internalServerErrorResponse();
  }
}

export async function deleteProfileImage(event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    // Delete the file from S3 if it exists
    if (event.user.profileImageUrl) {
      const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      const imageKey = extractS3KeyFromUrl(event.user.profileImageUrl);

      if (imageKey) {
        await deleteS3Object(s3Client, S3_BUCKET_ASSETS, imageKey);
      }
    }

    // Remove profile image URL from user
    const updatedUser = await prisma.user.update({
      where: { id: event.user.id },
      data: { profileImageUrl: null },
      select: {
        id: true,
        email: true,
        alias: true,
        profileImageUrl: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log('Deleted profile image for user:', {
      userId: event.user.id,
      alias: event.user.alias,
    });

    return respond(200, {
      user: {
        ...updatedUser,
        profileImageUrl: updatedUser.profileImageUrl ? assetS3UrlToCloudFrontUrl(updatedUser.profileImageUrl) : null,
      },
      message: 'Profile image deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting profile image:', error);
    return internalServerErrorResponse();
  }
}
