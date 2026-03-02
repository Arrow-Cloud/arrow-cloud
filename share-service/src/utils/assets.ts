export const CLOUDFRONT_ASSETS_URL = process.env.CLOUDFRONT_ASSETS_URL || 'https://assets.arrowcloud.dance';

export function assetS3UrlToCloudFrontUrl(s3Url: string): string {
  // Convert s3://arrow-cloud-assets/path/to/file to https://assets.arrowcloud.dance/path/to/file
  const url = new URL(s3Url);
  const key = url.pathname.substring(1); // Remove leading slash
  return `${CLOUDFRONT_ASSETS_URL}/${key}`;
}
