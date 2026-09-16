#!/usr/bin/env tsx
/**
 * Interactively assign a golf "par" to every chart in one or more local packs, song by song,
 * and write the results to a single JSON file. That file is the source of truth this later feeds
 * into two separate places (not done by this script):
 *   - the arrow-cloud golf event backend (keyed by chartHash - see api/src/utils/scoring/golf.ts
 *     and events/golf/backend/), and
 *   - a `Golf.ini` written into each pack's own folder, read in-game by
 *     Themes/ArrowCloudTheme/Scripts/SL-GolfHelpers.lua (Golf.GetPar) - section names are the
 *     song's folder name, optionally suffixed ":<Difficulty>" for a per-chart override, e.g.:
 *       [Honey]
 *       Par=3
 *       [Honey:Challenge]
 *       Par=4
 *
 * Usage:
 *   npx tsx scripts/assign-golf-pars.ts <path-to-pack> [<path-to-pack> ...] [--out <file>] [--pack-name <name>]
 *
 * Examples:
 *   npx tsx scripts/assign-golf-pars.ts "/mnt/c/Games/ITGmania/Songs/In The Golf - Beta Hills"
 *   npx tsx scripts/assign-golf-pars.ts "/path/Beta Hills" "/path/Beta Pines" --out scripts/data/golf-pars.json
 *
 * Re-running with the same --out file resumes where you left off: charts that already have a par
 * in that file are skipped (shown, not re-prompted) rather than asked again, so you can do this
 * across multiple sessions without redoing earlier work. Type "skip" at a prompt to leave a chart's
 * par unset for now (it'll be asked again next run); Ctrl+C at any point saves everything answered
 * so far before exiting.
 *
 * Same .sm/.ssc handling as scripts/get-pack-hashes.ts's known gotcha: when a song folder has both,
 * only the .ssc's chart(s) are used (StepMania itself prefers .ssc when both exist) - this is what
 * bit the initial Beta Hills/Beta Pines hash dump (see git history around events/golf/backend/config.json).
 *
 * Before each par prompt, also shows a sampling of real EX-leaderboard scores for that chart: ranks
 * 1, 2, 5, 10, 25 (whichever exist) plus 3 more ranks spread across the bottom of the board down to
 * dead last, so you can see both ends, not just the top. Each row shows its judgment breakdown, EX
 * score, and a golf score computed from that play's own raw submission (via calculateGolfStrokes) -
 * a calibration aid, not stored anywhere. This talks directly to the production DB (read-only raw
 * SQL, same ROW_NUMBER() ranking pattern as scripts/get-leaderboard.ts) and S3 (same raw-submission
 * fetch as scripts/download-play.ts), so it needs real AWS/DB credentials to run.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import * as readline from 'readline';
import { z } from 'zod';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient, Prisma } from '../api/prisma/generated/client';
import { Simfile } from '../api/src/utils/simfile/calc-hash';
import { calculateGolfStrokes } from '../api/src/utils/scoring/golf';
import { PlaySubmissionSchema } from '../api/src/utils/scoring/index';

interface ParEntry {
  pack: string;
  songFolder: string;
  simfileFile: string;
  title: string;
  artist: string;
  stepsType: string;
  difficulty: string;
  meter: number;
  chartHash: string;
  par: number | null;
}

function findSimfiles(dir: string): string[] {
  const found: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) found.push(...findSimfiles(fullPath));
    else if (stat.isFile()) {
      const lower = entry.toLowerCase();
      if (lower.endsWith('.ssc') || lower.endsWith('.sm')) found.push(fullPath);
    }
  }
  return found;
}

// Groups by song folder (the simfile's immediate parent dir), keeping only .ssc files for a folder
// that has any - matching what StepMania itself actually loads when both formats are present.
function groupBySongFolder(simfilePaths: string[]): Map<string, string[]> {
  const byFolder = new Map<string, string[]>();
  for (const p of simfilePaths) {
    const folder = dirname(p);
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder)!.push(p);
  }
  for (const [folder, files] of byFolder) {
    const sscFiles = files.filter((f) => f.toLowerCase().endsWith('.ssc'));
    if (sscFiles.length > 0) byFolder.set(folder, sscFiles);
  }
  return byFolder;
}

function scanPack(packDir: string, packName: string): ParEntry[] {
  const simfilePaths = findSimfiles(packDir);
  const grouped = groupBySongFolder(simfilePaths);
  const entries: ParEntry[] = [];

  for (const [folder, files] of grouped) {
    for (const file of files) {
      let simfile: Simfile;
      try {
        simfile = new Simfile(readFileSync(file, 'utf-8'));
      } catch (err) {
        console.error(`⚠️  Failed to parse ${file}: ${err instanceof Error ? err.message : err}`);
        continue;
      }
      for (const chart of simfile.charts) {
        entries.push({
          pack: packName,
          songFolder: basename(folder),
          simfileFile: basename(file),
          title: simfile.metadata.title || 'Unknown',
          artist: simfile.metadata.artist || 'Unknown',
          stepsType: chart.metadata.stepsType,
          difficulty: chart.metadata.difficulty,
          meter: chart.metadata.meter,
          chartHash: chart.calculateHash(),
          par: null,
        });
      }
    }
  }

  // Stable, human-friendly order for the interactive prompt.
  entries.sort((a, b) => a.songFolder.localeCompare(b.songFolder) || a.difficulty.localeCompare(b.difficulty));
  return entries;
}

function loadExisting(outPath: string): Map<string, ParEntry> {
  if (!existsSync(outPath)) return new Map();
  const raw = JSON.parse(readFileSync(outPath, 'utf-8')) as ParEntry[];
  return new Map(raw.map((e) => [e.chartHash, e]));
}

function saveAll(outPath: string, existing: Map<string, ParEntry>, fresh: ParEntry[]): void {
  // A fresh entry only overwrites an existing one if it's brand new to the file, or it now has a
  // just-answered par - a fresh entry that's still null (this run skipped past it because it
  // already had a real answer from a prior run) must never clobber that prior answer.
  const merged = new Map(existing);
  for (const entry of fresh) {
    const prior = merged.get(entry.chartHash);
    if (!prior || entry.par != null) merged.set(entry.chartHash, entry);
  }
  const all = [...merged.values()].sort(
    (a, b) => a.pack.localeCompare(b.pack) || a.songFolder.localeCompare(b.songFolder) || a.difficulty.localeCompare(b.difficulty),
  );
  writeFileSync(outPath, JSON.stringify(all, null, 2) + '\n');
}

// --- EX leaderboard sampling (par-calibration aid) ---
// Shows real players' scores at a spread of ranks so the par prompt isn't a total guess. Read-only
// against the DB/S3 - never runs itself, only from a run the user kicks off (see bottom of file).

// Ranks near the top are fixed; ranks near the bottom are computed per chart (see
// computeTargetRanks) since "the end of the leaderboard" is a different number for every chart.
const TOP_RANKS = [1, 2, 5, 10, 25];
const BOTTOM_SAMPLE_COUNT = 3;

// Always include this play (wherever it ranks) alongside the sampled ranks, so par calibration can
// be checked against your own actual score, not just strangers'.
const OWN_USER_ID = '27cfc687-8d10-4132-bd29-da3b4ef54dfb';

const LeaderboardSampleSchema = z.object({
  rank: z.bigint().transform(Number),
  data: z.object({
    score: z.string(),
    grade: z.string(),
    judgments: z.record(z.number()),
  }),
  userAlias: z.string(),
  userId: z.string(),
  playId: z.number(),
  rawTimingDataUrl: z.string().nullable(),
});
type LeaderboardSample = z.infer<typeof LeaderboardSampleSchema>;

// Ordered, distinct abbreviations for a dense one-line-per-sample display - a plain first-letter
// abbreviation collides for the two "Fantastic (_ms)" windows, so these are spelled out by hand.
const JUDGMENT_ABBREVIATIONS: [name: string, abbr: string][] = [
  ['Fantastic (10ms)', 'F10'],
  ['Fantastic (15ms)', 'F15'],
  ['Fantastic (23ms)', 'F23'],
  ['Excellent', 'Ex'],
  ['Great', 'Gr'],
  ['Decent', 'De'],
  ['Way Off', 'WO'],
  ['Miss', 'Mi'],
];

function abbreviationFor(name: string): string {
  return JUDGMENT_ABBREVIATIONS.find(([known]) => known === name)?.[1] ?? name;
}

// Which judgment columns to show for a batch of samples - only the ones actually present (so a
// chart with no ITG-only windows doesn't grow a bunch of always-zero columns), known windows first
// in their usual tightest-to-loosest order, then anything unrecognized, alphabetically.
function judgmentColumnsFor(samples: LeaderboardSample[]): string[] {
  const known = JUDGMENT_ABBREVIATIONS.map(([name]) => name).filter((name) => samples.some((s) => name in s.data.judgments));
  const seen = new Set(known);
  const extra = new Set<string>();
  for (const sample of samples) {
    for (const key of Object.keys(sample.data.judgments)) {
      if (!seen.has(key)) extra.add(key);
    }
  }
  return [...known, ...[...extra].sort()];
}

const padLeft = (s: string, w: number) => s.padStart(w);
const padRight = (s: string, w: number) => s.padEnd(w);

async function fetchLeaderboardTotal(prisma: PrismaClient, chartHash: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint as count
    FROM "PlayLeaderboard" pl
    JOIN "Play" p ON pl."playId" = p.id
    JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
    WHERE p."chartHash" = ${chartHash}
      AND l.type = 'EX'
  `;
  return Number(rows[0]?.count ?? 0);
}

// Top ranks are fixed; the bottom is 3 ranks spread from just past the top-rank window down to
// (and always including) dead last, so "how are the worst scores doing" scales with a chart's
// actual leaderboard size instead of being some other arbitrary fixed rank.
function computeTargetRanks(total: number): number[] {
  const top = TOP_RANKS.filter((r) => r <= total);
  const maxTop = top.length > 0 ? Math.max(...top) : 0;
  if (total <= maxTop) return top; // leaderboard is small enough that the top ranks already reach the end

  const bottom = new Set<number>();
  for (let i = 1; i <= BOTTOM_SAMPLE_COUNT; i++) {
    const rank = maxTop + Math.round(((total - maxTop) * i) / BOTTOM_SAMPLE_COUNT);
    bottom.add(Math.min(total, Math.max(maxTop + 1, rank)));
  }
  return [...new Set([...top, ...bottom])].sort((a, b) => a - b);
}

async function fetchLeaderboardSamples(prisma: PrismaClient, chartHash: string): Promise<{ total: number; samples: LeaderboardSample[] }> {
  const total = await fetchLeaderboardTotal(prisma, chartHash);
  if (total === 0) return { total, samples: [] };

  const targetRanks = computeTargetRanks(total);
  const rawResults = await prisma.$queryRaw`
    WITH ranked AS (
      SELECT
        ROW_NUMBER() OVER (ORDER BY pl."sortKey" DESC) as rank,
        pl.data,
        u.alias as "userAlias",
        p."userId" as "userId",
        p.id as "playId",
        p."rawTimingDataUrl" as "rawTimingDataUrl"
      FROM "PlayLeaderboard" pl
      JOIN "Play" p ON pl."playId" = p.id
      JOIN "User" u ON p."userId" = u.id
      JOIN "Leaderboard" l ON pl."leaderboardId" = l.id
      WHERE p."chartHash" = ${chartHash}
        AND l.type = 'EX'
    )
    SELECT * FROM ranked WHERE rank IN (${Prisma.join(targetRanks)}) OR "userId" = ${OWN_USER_ID}
    ORDER BY rank ASC
  `;
  return { total, samples: z.array(LeaderboardSampleSchema).parse(rawResults) };
}

// Golf score for a sampled play, computed from its raw submission - not stored anywhere, since golf
// scoring didn't exist when these plays were originally submitted.
async function fetchGolfScore(s3: S3Client, rawTimingDataUrl: string | null): Promise<number | undefined> {
  if (!rawTimingDataUrl) return undefined;
  try {
    const url = new URL(rawTimingDataUrl);
    const obj = await s3.send(new GetObjectCommand({ Bucket: url.hostname, Key: url.pathname.slice(1) }));
    if (!obj.Body) return undefined;
    const body = await obj.Body.transformToString();
    const submission = PlaySubmissionSchema.parse(JSON.parse(body));
    const { totalStrokes } = calculateGolfStrokes({ timingData: submission.timingData, radar: submission.radar });
    return totalStrokes / 1000;
  } catch {
    return undefined; // sampling is just a calibration aid - one bad play shouldn't block the prompt
  }
}

async function printLeaderboardSamples(prisma: PrismaClient, s3: S3Client, chartHash: string): Promise<void> {
  let total: number;
  let samples: LeaderboardSample[];
  try {
    ({ total, samples } = await fetchLeaderboardSamples(prisma, chartHash));
  } catch (err) {
    console.log(`  (couldn't fetch EX leaderboard: ${err instanceof Error ? err.message : err})`);
    return;
  }
  if (samples.length === 0) {
    console.log('  No EX leaderboard entries yet.');
    return;
  }
  console.log(`  ${total} EX leaderboard entr${total === 1 ? 'y' : 'ies'} total.`);

  const judgmentColumns = judgmentColumnsFor(samples);
  const rows: { rank: string; player: string; ex: string; grade: string; golf: string; judgments: string[] }[] = [];
  for (const sample of samples) {
    const golfScore = await fetchGolfScore(s3, sample.rawTimingDataUrl);
    rows.push({
      rank: `#${sample.rank}`,
      player: sample.userId === OWN_USER_ID ? `${sample.userAlias} (you)` : sample.userAlias,
      ex: `${Number(sample.data.score).toFixed(2)}%`,
      grade: sample.data.grade,
      golf: golfScore === undefined ? 'n/a' : golfScore.toFixed(2),
      judgments: judgmentColumns.map((name) => String(sample.data.judgments[name] ?? 0)),
    });
  }

  const abbrs = judgmentColumns.map(abbreviationFor);
  const rankW = Math.max(4, ...rows.map((r) => r.rank.length));
  const playerW = Math.max(6, ...rows.map((r) => r.player.length));
  const exW = Math.max(3, ...rows.map((r) => r.ex.length));
  const gradeW = Math.max(5, ...rows.map((r) => r.grade.length));
  const golfW = Math.max(4, ...rows.map((r) => r.golf.length));
  const judgmentW = abbrs.map((abbr, i) => Math.max(abbr.length, ...rows.map((r) => r.judgments[i].length)));

  const line = (rank: string, player: string, ex: string, grade: string, golf: string, judgments: string[]): string =>
    `  ${padRight(rank, rankW)}  ${padRight(player, playerW)}  ${padLeft(ex, exW)}  ${padRight(grade, gradeW)}  ${padLeft(golf, golfW)}  ${judgments
      .map((v, i) => padLeft(v, judgmentW[i]))
      .join(',')}`;

  console.log(line('Rank', 'Player', 'EX%', 'Grade', 'Golf', abbrs));
  for (const r of rows) console.log(line(r.rank, r.player, r.ex, r.grade, r.golf, r.judgments));
}

async function main() {
  const args = process.argv.slice(2);
  const packDirs: string[] = [];
  let outPath = 'scripts/data/golf-pars.json';
  let explicitPackName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      outPath = args[++i];
    } else if (args[i] === '--pack-name') {
      explicitPackName = args[++i];
    } else {
      packDirs.push(args[i]);
    }
  }

  if (packDirs.length === 0) {
    console.error('Usage: npx tsx scripts/assign-golf-pars.ts <path-to-pack> [<path-to-pack> ...] [--out <file>] [--pack-name <name>]');
    process.exit(1);
  }

  const existing = loadExisting(outPath);
  if (existing.size > 0) console.log(`Resuming from ${outPath} (${existing.size} chart(s) already recorded).\n`);

  const allFresh: ParEntry[] = [];
  for (const packDir of packDirs) {
    if (!existsSync(packDir) || !statSync(packDir).isDirectory()) {
      console.error(`Skipping - not a directory: ${packDir}`);
      continue;
    }
    const packName = explicitPackName ?? basename(packDir);
    const entries = scanPack(packDir, packName);
    const songCount = new Set(entries.map((e) => e.songFolder)).size;
    console.log(`📦 ${packName}: ${entries.length} chart(s) across ${songCount} song(s).`);
    allFresh.push(...entries);
  }

  const prisma = new PrismaClient();
  const s3 = new S3Client();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));

  // Save-on-exit, including a bare Ctrl+C, so an interrupted session never loses answered pars.
  const flush = () => saveAll(outPath, existing, allFresh);
  rl.on('SIGINT', () => {
    flush();
    console.log(`\nSaved progress to ${outPath}. Resume any time by re-running with the same --out.`);
    process.exit(0);
  });

  let asked = 0;
  let answered = 0;
  for (const entry of allFresh) {
    const already = existing.get(entry.chartHash);
    if (already && already.par != null) {
      continue; // already answered in a prior run
    }
    asked++;
    const chartLabel = `${entry.title} - ${entry.artist} [${entry.pack} / ${entry.songFolder}${entry.difficulty ? ` / ${entry.difficulty} ${entry.meter}` : ''}]`;
    console.log(chartLabel);
    await printLeaderboardSamples(prisma, s3, entry.chartHash);
    let par: number | null = null;
    while (par === null) {
      const answer = (await ask(`  Par (or "skip"): `)).trim();
      if (answer.toLowerCase() === 'skip' || answer === '') break;
      const parsed = Number(answer);
      if (Number.isFinite(parsed) && parsed >= 0) {
        par = parsed;
      } else {
        console.log('  Enter a non-negative number, or "skip".');
      }
    }
    if (par !== null) {
      entry.par = par;
      answered++;
      // Written after every answer, not just at the end - a crash mid-session costs at most the
      // current in-progress prompt, not the whole run.
      flush();
    }
    console.log();
  }

  rl.close();
  flush();
  await prisma.$disconnect();
  console.log(`Done. Answered ${answered}/${asked} prompted chart(s) this run. Results in ${outPath}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
