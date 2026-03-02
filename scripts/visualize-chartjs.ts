#!/usr/bin/env node

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ChartJSTimingVisualizer } from '../api/src/utils/chartjs-timing-visualizer';
import { PlaySubmissionSchema, EX_SCORING_SYSTEM, ScoringSystemHelper } from '../api/src/utils/scoring';
import * as path from 'path';

/**
 * Script to download a submission JSON from S3 and create a Chart.js timing visualization
 * Usage: npm run visualize-chartjs <s3-url>
 * Example: npm run visualize-chartjs s3://arrow-cloud-scores/scores/2c1b502a354d01e4/ccdfd779-2fb9-4b17-b191-b80abd05b994/1752419580290.json
 */

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npm run visualize-chartjs <s3-url>');
    console.error('Example: npm run visualize-chartjs s3://arrow-cloud-scores/scores/2c1b502a354d01e4/ccdfd779-2fb9-4b17-b191-b80abd05b994/1752419580290.json');
    process.exit(1);
  }

  const s3Url = args[0];

  try {
    console.log(`Downloading submission from: ${s3Url}`);

    // Parse S3 URL to extract bucket and key
    const { bucket, key } = parseS3Url(s3Url);

    // Download the submission JSON
    const submissionData = await downloadFromS3(bucket, key);

    // Parse and validate the submission
    console.log('Parsing submission data...');
    const submission = PlaySubmissionSchema.parse(submissionData);

    console.log(`Processing: ${submission.songName} by ${submission.artist}`);
    console.log(`Timing data points: ${submission.timingData.length}`);

    if (submission.lifebarInfo && submission.lifebarInfo.length > 0) {
      console.log(`Lifebar data points: ${submission.lifebarInfo.length}`);
    }

    // Create visualization
    console.log('Creating Chart.js visualization...');
    const visualizer = new ChartJSTimingVisualizer({
      width: 1500,
      height: 400,
      title: submission.songName,
    });

    // Use EX scoring system for judgment colors
    const scoringSystem = new ScoringSystemHelper(EX_SCORING_SYSTEM);
    const imageBuffer = await visualizer.visualizeTimingData(submission, scoringSystem);

    // Save the image
    const outputPath = path.join(process.cwd(), 'chartjs-timing-visualization.png');
    visualizer.saveToFile(imageBuffer, outputPath);

    console.log(`✅ Chart.js visualization saved to: ${outputPath}`);
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
    console.log(`📊 Total data points plotted: ${submission.timingData.filter(([_, offset]) => offset !== 'Miss').length}`);
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
    console.log(`❌ Miss count: ${submission.timingData.filter(([_, offset]) => offset === 'Miss').length}`);

    if (submission.lifebarInfo && submission.lifebarInfo.length > 0) {
      console.log(`💗 Lifebar visualization included with dual y-axis`);
    }
  } catch (error) {
    console.error('❌ Error creating Chart.js visualization:', error);
    process.exit(1);
  }
}

function parseS3Url(url: string): { bucket: string; key: string } {
  try {
    // Handle s3:// protocol format
    if (url.startsWith('s3://')) {
      const s3Path = url.slice(5); // Remove 's3://' prefix
      const firstSlashIndex = s3Path.indexOf('/');

      if (firstSlashIndex === -1) {
        throw new Error('S3 URL must include a key path');
      }

      const bucket = s3Path.slice(0, firstSlashIndex);
      const key = s3Path.slice(firstSlashIndex + 1);

      if (!bucket || !key) {
        throw new Error('Both bucket and key must be specified');
      }

      return { bucket, key };
    }

    // Handle HTTPS URL formats
    const urlObj = new URL(url);

    if (urlObj.hostname.endsWith('.s3.amazonaws.com')) {
      // Format: https://bucket.s3.amazonaws.com/key
      const bucket = urlObj.hostname.split('.')[0];
      const key = urlObj.pathname.slice(1); // Remove leading slash
      return { bucket, key };
    } else if (urlObj.hostname === 's3.amazonaws.com') {
      // Format: https://s3.amazonaws.com/bucket/key
      const pathParts = urlObj.pathname.slice(1).split('/');
      const bucket = pathParts[0];
      const key = pathParts.slice(1).join('/');
      return { bucket, key };
    } else if (urlObj.hostname.includes('.s3.')) {
      // Format: https://bucket.s3.region.amazonaws.com/key
      const bucket = urlObj.hostname.split('.')[0];
      const key = urlObj.pathname.slice(1);
      return { bucket, key };
    } else {
      throw new Error('Unrecognized S3 URL format');
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL format: ${url}. Expected formats: s3://bucket/key or https://bucket.s3.amazonaws.com/key`);
    }
    throw error;
  }
}

async function downloadFromS3(bucket: string, key: string): Promise<any> {
  const s3Client = new S3Client();

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error('No data received from S3');
    }

    // Convert stream to string
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);
    const jsonString = buffer.toString('utf-8');

    return JSON.parse(jsonString);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to download from S3: ${error.message}`);
    }
    throw error;
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}
