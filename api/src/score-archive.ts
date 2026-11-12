import { S3Client } from '@aws-sdk/client-s3';
import { MONTH } from './utils/score-archive/keys';
import { Config, run } from './utils/score-archive/run';

export interface ArchiveEvent {
  /** Only `true` writes; anything else is a dry run */
  write?: unknown;
  force?: string[];
}

export interface ArchiveResult {
  planned: string[];
  built: string[];
}

export function createS3Client(): S3Client {
  // S3_FORCE_PATH_STYLE is for local S3
  return new S3Client({ forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' });
}

export function configFrom(env: NodeJS.ProcessEnv, event: ArchiveEvent): Config {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
  };
  const force = event.force ?? [];
  if (!Array.isArray(force) || force.some((month) => typeof month !== 'string' || !MONTH.test(month))) {
    throw new Error(`force must be a list of YYYY-MM months, got ${JSON.stringify(event.force)}`);
  }
  return {
    scoresBucket: required('SCORES_BUCKET'),
    archiveBucket: required('ARCHIVE_BUCKET'),
    force: new Set(force),
    dryRun: event.write !== true,
  };
}

export async function handler(event: ArchiveEvent = {}): Promise<ArchiveResult> {
  const result = await run(createS3Client(), configFrom(process.env, event));
  // Throw for Lambda retry
  if (result.failed.length > 0) throw new Error(`Failed to build ${result.failed.join(', ')}`);
  return { planned: result.planned, built: result.built };
}
