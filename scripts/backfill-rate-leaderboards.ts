#!/usr/bin/env tsx
/**
 * Backfill the rate-eligible global leaderboards (ITG Rate = 18, EX Rate = 19) for historical plays.
 *
 * Background: the rate leaderboards shipped on 2026-08-22 and musicRate only started being captured in
 * PlayLeaderboard.data on 2026-08-27 (play id 472180 onward). Every play at or below that cutoff has to be
 * re-evaluated from its raw S3 submission payload - the DB does not know its music rate. This script does
 * ONLY that: for each play it fetches the payload, checks eligibility for 18/19, and replaces that play's
 * 18/19 entries. The standard leaderboards (2/3/4) and all event leaderboards are never touched.
 *
 * Usage:
 *   npx tsx scripts/backfill-rate-leaderboards.ts [options]
 *
 * Options:
 *   --max-play-id <id>     Process plays with id <= this (default 472179, the last play lacking musicRate)
 *   --start-after <id>     Resume: skip plays with id <= this
 *   --limit <n>            Stop after n plays (useful for a trial run)
 *   --concurrency <n>      Parallel S3 fetch + score calculations (default 20)
 *   --batch-size <n>       Plays per DB page / write transaction (default 500)
 *   --retry-file <path>    Only process play ids listed in a failures file from a previous run
 *   --failures-out <path>  Where to write failed play ids (default scripts/output/rate-backfill-failures.jsonl)
 *   --dry-run              Compute everything, write nothing
 *
 * Examples:
 *   npx tsx scripts/backfill-rate-leaderboards.ts --limit 200 --dry-run
 *   npx tsx scripts/backfill-rate-leaderboards.ts
 *   npx tsx scripts/backfill-rate-leaderboards.ts --start-after 250000
 *   npx tsx scripts/backfill-rate-leaderboards.ts --retry-file scripts/output/rate-backfill-failures.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import { ZodError } from 'zod';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient, Play, Prisma } from '../api/prisma/generated/client';
import { ITGRateLeaderboard, EXRateLeaderboard, GLOBAL_ITG_RATE_LEADERBOARD_ID, GLOBAL_EX_RATE_LEADERBOARD_ID } from '../api/src/utils/leaderboard';
import {
  EX_GRADING_SYSTEM,
  EX_SCORING_SYSTEM,
  ITG_GRADING_SYSTEM,
  MONEY_SCORING_SYSTEM,
  SubmissionCalculator,
  validatePlaySubmission,
} from '../api/src/utils/scoring';

const prisma = new PrismaClient();
const s3Client = new S3Client();

// Last play id whose standard leaderboard entries lack musicRate (see scripts/inspect-music-rate-coverage.sql).
const DEFAULT_MAX_PLAY_ID = 472179;
const RATE_LEADERBOARD_IDS = [GLOBAL_ITG_RATE_LEADERBOARD_ID, GLOBAL_EX_RATE_LEADERBOARD_ID];

interface CliOptions {
  maxPlayId: number;
  startAfter: number;
  limit?: number;
  concurrency: number;
  batchSize: number;
  retryFile?: string;
  failuresOut: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    maxPlayId: DEFAULT_MAX_PLAY_ID,
    startAfter: 0,
    concurrency: 20,
    batchSize: 500,
    failuresOut: path.join('scripts', 'output', 'rate-backfill-failures.jsonl'),
    dryRun: false,
  };

  const intArg = (flag: string, value: string | undefined): number => {
    const n = parseInt(value ?? '', 10);
    if (Number.isNaN(n) || n < 0) {
      console.error(`${flag} requires a non-negative integer`);
      process.exit(1);
    }
    return n;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--max-play-id':
        opts.maxPlayId = intArg(arg, argv[++i]);
        break;
      case '--start-after':
        opts.startAfter = intArg(arg, argv[++i]);
        break;
      case '--limit':
        opts.limit = intArg(arg, argv[++i]);
        break;
      case '--concurrency':
        opts.concurrency = Math.max(1, intArg(arg, argv[++i]));
        break;
      case '--batch-size':
        opts.batchSize = Math.max(1, intArg(arg, argv[++i]));
        break;
      case '--retry-file':
        opts.retryFile = argv[++i];
        break;
      case '--failures-out':
        opts.failuresOut = argv[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }
  }

  return opts;
}

type RateEntry = { playId: number; leaderboardId: number; data: Prisma.InputJsonValue; sortKey: string };
// invalidPayload: the S3 payload predates the current submission schema (e.g. no `passed` field). These
// are deterministic - the API would reject the same payload today - so they are reported but never retried.
type PlayResult = { playId: number; entries: RateEntry[]; error?: string; invalidPayload?: boolean };

async function loadPayload(play: Play) {
  const url = new URL(play.rawTimingDataUrl);
  const response = await s3Client.send(new GetObjectCommand({ Bucket: url.hostname, Key: url.pathname.substring(1) }));
  if (!response.Body) {
    throw new Error('Empty S3 object');
  }
  return validatePlaySubmission(JSON.parse(await response.Body.transformToString()));
}

/**
 * Evaluate a single play against the two rate leaderboards. Returns zero entries when the play is
 * ineligible (failed, autoplay, rate < 1, pre-1.2 body version, ...) - that is a valid outcome, not an error.
 */
async function computeRateEntries(play: Play): Promise<PlayResult> {
  if (!play.rawTimingDataUrl) {
    return { playId: play.id, entries: [], error: 'no rawTimingDataUrl' };
  }

  try {
    const submission = await loadPayload(play);
    const calculator = new SubmissionCalculator(submission, prisma);
    const systems = [
      new ITGRateLeaderboard(play, submission, MONEY_SCORING_SYSTEM, ITG_GRADING_SYSTEM, prisma, calculator),
      new EXRateLeaderboard(play, submission, EX_SCORING_SYSTEM, EX_GRADING_SYSTEM, prisma, calculator),
    ];

    const entries: RateEntry[] = [];
    for (const system of systems) {
      if (!system.isEligible()) {
        continue;
      }
      entries.push({
        playId: play.id,
        leaderboardId: system.getId(),
        data: await system.serializeData(),
        sortKey: await system.getSortKey(),
      });
    }
    return { playId: play.id, entries };
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return { playId: play.id, entries: [], error: issues, invalidPayload: true };
    }
    return { playId: play.id, entries: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function writeBatch(results: PlayResult[], dryRun: boolean): Promise<number> {
  // Only replace entries for plays we successfully evaluated. A failed play keeps whatever it had
  // (possibly a pre-musicRate entry) and is recorded in the failures file for a retry.
  const succeeded = results.filter((r) => !r.error);
  const playIds = succeeded.map((r) => r.playId);
  const entries = succeeded.flatMap((r) => r.entries);

  if (dryRun || playIds.length === 0) {
    return entries.length;
  }

  await prisma.$transaction([
    prisma.playLeaderboard.deleteMany({ where: { playId: { in: playIds }, leaderboardId: { in: RATE_LEADERBOARD_IDS } } }),
    prisma.playLeaderboard.createMany({ data: entries }),
  ]);
  return entries.length;
}

function readRetryIds(file: string): number[] {
  const ids = new Set<number>();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as { playId: number; invalidPayload?: boolean };
    if (Number.isInteger(entry.playId) && !entry.invalidPayload) ids.add(entry.playId);
  }
  return [...ids].sort((a, b) => a - b);
}

/** Yields pages of plays to process, either from a retry file or by walking ids up to maxPlayId. */
async function* playPages(opts: CliOptions): AsyncGenerator<Play[]> {
  if (opts.retryFile) {
    const ids = readRetryIds(opts.retryFile);
    console.log(`Retrying ${ids.length} play ids from ${opts.retryFile}`);
    for (let i = 0; i < ids.length; i += opts.batchSize) {
      const slice = ids.slice(i, i + opts.batchSize);
      yield prisma.play.findMany({ where: { id: { in: slice } }, orderBy: { id: 'asc' } });
    }
    return;
  }

  let cursor = opts.startAfter;
  while (true) {
    const plays = await prisma.play.findMany({
      where: { id: { gt: cursor, lte: opts.maxPlayId } },
      orderBy: { id: 'asc' },
      take: opts.batchSize,
    });
    if (plays.length === 0) return;
    cursor = plays[plays.length - 1].id;
    yield plays;
  }
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const limit = pLimit(opts.concurrency);

  console.log(`Backfilling rate leaderboards (${RATE_LEADERBOARD_IDS.join(', ')})`);
  console.log(
    opts.retryFile
      ? `Source: retry file ${opts.retryFile}`
      : `Range: play id ${opts.startAfter + 1} .. ${opts.maxPlayId}${opts.limit ? ` (limit ${opts.limit})` : ''}`,
  );
  console.log(`Concurrency ${opts.concurrency}, batch size ${opts.batchSize}${opts.dryRun ? ', DRY RUN - no writes' : ''}`);

  fs.mkdirSync(path.dirname(opts.failuresOut), { recursive: true });
  const failures = fs.createWriteStream(opts.failuresOut, { flags: 'w' });

  const stats = { processed: 0, eligible: 0, ineligible: 0, entries: 0, invalidPayload: 0, failed: 0 };
  const startedAt = Date.now();
  let lastPlayId = opts.startAfter;

  try {
    for await (let plays of playPages(opts)) {
      if (opts.limit !== undefined) {
        const remaining = opts.limit - stats.processed;
        if (remaining <= 0) break;
        plays = plays.slice(0, remaining);
      }

      const results = await Promise.all(plays.map((play) => limit(() => computeRateEntries(play))));

      for (const r of results) {
        if (r.error) {
          if (r.invalidPayload) stats.invalidPayload++;
          else stats.failed++;
          failures.write(JSON.stringify({ playId: r.playId, invalidPayload: r.invalidPayload ?? false, error: r.error }) + '\n');
        } else if (r.entries.length > 0) {
          stats.eligible++;
        } else {
          stats.ineligible++;
        }
      }

      stats.entries += await writeBatch(results, opts.dryRun);
      stats.processed += results.length;
      lastPlayId = plays[plays.length - 1].id;

      const elapsedSec = (Date.now() - startedAt) / 1000;
      const rate = stats.processed / elapsedSec;
      const remainingPlays = opts.retryFile ? undefined : opts.maxPlayId - lastPlayId;
      const eta = remainingPlays !== undefined && rate > 0 ? ` eta ~${Math.round(remainingPlays / rate / 60)}m` : '';
      console.log(
        `[play ${lastPlayId}] processed ${stats.processed} | eligible ${stats.eligible} | ineligible ${stats.ineligible} | ` +
          `invalid ${stats.invalidPayload} | failed ${stats.failed} | entries ${stats.entries} | ${rate.toFixed(1)} plays/s${eta}`,
      );

      if (opts.limit !== undefined && stats.processed >= opts.limit) break;
    }

    console.log('\nDone.');
    console.log(`  processed:  ${stats.processed}`);
    console.log(`  eligible:   ${stats.eligible} plays -> ${stats.entries} rate leaderboard entries${opts.dryRun ? ' (not written)' : ''}`);
    console.log(`  ineligible: ${stats.ineligible}`);
    console.log(`  invalid:    ${stats.invalidPayload} (payload predates the submission schema; never eligible, not retried)`);
    console.log(`  failed:     ${stats.failed}${stats.failed > 0 ? ` (see ${opts.failuresOut}, re-run with --retry-file)` : ''}`);
    console.log(`  last play id: ${lastPlayId} (resume with --start-after ${lastPlayId})`);
  } catch (error) {
    console.error(`\nAborted after play ${lastPlayId} (resume with --start-after ${lastPlayId}):`, error);
    process.exitCode = 1;
  } finally {
    failures.end();
    await prisma.$disconnect();
  }
})();
