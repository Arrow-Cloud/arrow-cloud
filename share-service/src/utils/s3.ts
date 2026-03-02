import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

export async function loadTimingDataFromS3(s3Url: string, s3Client: S3Client): Promise<any> {
  const url = new URL(s3Url);
  const bucket = url.hostname;
  const key = url.pathname.substring(1);

  console.log(`[S3] Fetching timing data from S3:`);
  console.log(`[S3] Bucket: ${bucket}`);
  console.log(`[S3] Key: ${key}`);
  console.log(`[S3] Full URL: ${s3Url}`);

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  try {
    const response = await s3Client.send(command);
    console.log(`[S3] ✓ Successfully fetched object from S3`);

    if (!response.Body) {
      throw new Error('No data found in S3 object');
    }

    const bodyString = await response.Body.transformToString();
    console.log(`[S3] Body size: ${bodyString.length} bytes`);
    const parsed = JSON.parse(bodyString);
    console.log(`[S3] ✓ Successfully parsed JSON data`);
    return parsed;
  } catch (error) {
    console.error('[S3] ✗ Failed to fetch from S3:', error);
    if (error instanceof Error) {
      console.error('[S3] Error name:', error.name);
      console.error('[S3] Error message:', error.message);
    }
    throw error;
  }
}
