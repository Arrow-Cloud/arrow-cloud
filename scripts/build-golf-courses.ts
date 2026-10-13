#!/usr/bin/env tsx
/**
 * Build events/golf/config/courses.json - the single source of truth for which charts belong to
 * which course, in what hole order, at what par.
 *
 * Inputs are scripts/assign-golf-pars.ts's finalized output (one file per course). Everything else
 * golf knows about a chart - course membership, hole number, par, song name - is derived from here
 * rather than being captured at score time, so a par revision or a re-order needs no backfill of
 * already-ingested plays (see events/golf/backend/src/courses.ts, which resolves hash -> hole at
 * read time).
 *
 * Hole numbers are explicit indices, not re-derived by sorting at read time, so they stay stable if
 * a song is renamed and can be re-routed later without a data migration. The order they're assigned
 * in is the par file's own order, which assign-golf-pars.ts produces via localeCompare on the song
 * folder name.
 *
 * Usage:
 *   npx tsx scripts/build-golf-courses.ts [--check]
 *
 * --check exits non-zero if the committed courses.json differs from what the inputs produce, so CI
 * can catch the par files and the config drifting apart.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

interface ParEntry {
  pack: string;
  songFolder: string;
  title: string;
  artist: string;
  stepsType: string;
  difficulty: string;
  meter: number;
  chartHash: string;
  par: number | null;
}

interface Hole {
  holeNumber: number;
  chartHash: string;
  /** What the site and result cards show. Derived from the simfile TITLE, cleaned (see
   * toDisplayName) - raw `songName`/`songFolder` are kept alongside it so a curation pass has both
   * to work from. */
  displayName: string;
  songName: string;
  songFolder: string;
  artist: string;
  meter: number;
  par: number | null;
}

interface Course {
  /** Stable public identifier - used in API query params (`/activity?course=beta-pines`) and in
   * responses as `courseSlug`. Lower-case, hyphenated, never reused for a different course. */
  slug: string;
  name: string;
  order: number;
  /** Hidden courses are excluded from every public listing, leaderboard and trophy evaluation -
   * see docs/plans/golf-beta-prep.md §1.4. The Alpha Testing charts exist only to exercise the
   * pipeline end to end without touching real beta boards. */
  hidden: boolean;
  pack: string | null;
  holes: Hole[];
}

// Simfile TITLE tags in these packs are inconsistent: 14 of the 36 beta charts carry a trailing
// difficulty in the title ("MAD (Hard)", "Chemicals (Medium)") because the chart was authored as a
// re-difficulty, and a couple use .sm's backslash escape for "#". Neither belongs in a song name on
// the site, so both are cleaned here.
//
// Deliberately NOT falling back to the song folder name instead: for most charts the folder is the
// better string, but for several it is worse ("Nasty (Match My Tweak Remix)" is richer than the
// title's "Nasty (Hard)", while "09 - Undo U (4by4 Mix)" leads with a track number and "Itan" is a
// romanization of the title's "\u7570\u7aef"). There is no rule that picks correctly in every case, so this
// takes the title, cleans the mechanical noise out of it, and leaves genuine naming calls to a human
// editing this file's output - see the note in docs/plans/golf-beta-prep.md \u00a71.1.
const DIFFICULTY_SUFFIX = /\s*\((?:Beginner|Easy|Medium|Hard|Challenge|Edit)\)\s*$/i;

// Simfile tags are stored with escape sequences - a backslash before a character that would otherwise be
// syntax ("En\-vy", "GET \#HYPER"). Anything shown to a player has to be unescaped: the game client sends
// text already unescaped, and /activity and /rankings serve displayName and artist straight from here. An
// earlier version only handled `\#`, so an artist with `\-` reached the live feed as "En\-vy".
const unescapeSimfile = (text: string) => text.replace(/\\(.)/g, '$1');

function toDisplayName(title: string): string {
  return unescapeSimfile(title).replace(DIFFICULTY_SUFFIX, '').trim();
}

const OUT = 'events/golf/config/courses.json';

const SOURCES: { slug: string; name: string; order: number; file: string }[] = [
  { slug: 'beta-hills', name: 'Beta Hills', order: 1, file: 'scripts/data/golf-beta-hills-pars-final.json' },
  { slug: 'beta-pines', name: 'Beta Pines', order: 2, file: 'scripts/data/golf-beta-pines-pars-final.json' },
];

// The original pre-beta hashes. They predate assign-golf-pars.ts, so they have no par and no song
// metadata to read - they're carried as a hidden course purely as an end-to-end test target.
const ALPHA_PAR = 3;
const ALPHA_HASHES = ['7a520534f16d6455', '065f74f741eb2f9d', 'f3871997119d5052', '50bcefd78fa82988'];

function build(): Course[] {
  const courses: Course[] = SOURCES.map(({ slug, name, order, file }) => {
    const entries: ParEntry[] = JSON.parse(readFileSync(file, 'utf-8'));
    return {
      slug,
      name,
      order,
      hidden: false,
      pack: entries[0]?.pack ?? null,
      holes: entries.map((e, i) => ({
        holeNumber: i + 1,
        chartHash: e.chartHash,
        displayName: toDisplayName(e.title),
        songName: e.title,
        songFolder: e.songFolder,
        artist: unescapeSimfile(e.artist),
        meter: e.meter,
        par: e.par,
      })),
    };
  });

  courses.push({
    slug: 'alpha-testing',
    name: 'Alpha Testing',
    order: 99,
    hidden: true,
    pack: null,
    holes: ALPHA_HASHES.map((chartHash, i) => ({
      holeNumber: i + 1,
      chartHash,
      displayName: 'Unknown',
      songName: 'Unknown',
      songFolder: 'Unknown',
      artist: 'Unknown',
      meter: 0,
      // A flat 3: these predate assign-golf-pars.ts and exist only to exercise the pipeline, so
      // there is no real hole to calibrate against. Must match GOLF_CHARTS in
      // api/src/utils/event-result-images.ts, which carries its own copy for the result cards.
      par: ALPHA_PAR,
    })),
  });

  return courses;
}

function main() {
  const courses = build();

  const seen = new Map<string, string>();
  for (const course of courses) {
    for (const hole of course.holes) {
      const prior = seen.get(hole.chartHash);
      if (prior) throw new Error(`Chart ${hole.chartHash} appears in both "${prior}" and "${course.slug}"`);
      seen.set(hole.chartHash, course.slug);
    }
  }

  const json = JSON.stringify({ courses }, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    const current = readFileSync(OUT, 'utf-8');
    if (current !== json) {
      console.error(`${OUT} is out of date - re-run: npx tsx scripts/build-golf-courses.ts`);
      process.exit(1);
    }
    console.log(`${OUT} is up to date.`);
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);

  const visible = courses.filter((c) => !c.hidden);
  console.log(`Wrote ${OUT}`);
  for (const c of courses) {
    const pars = c.holes.map((h) => h.par).filter((p): p is number => p != null);
    console.log(`  ${c.hidden ? '(hidden) ' : ''}${c.name}: ${c.holes.length} holes, ${pars.length} par'd, total par ${pars.reduce((a, b) => a + b, 0)}`);
  }
  console.log(`  ${seen.size} charts total, ${visible.reduce((n, c) => n + c.holes.length, 0)} on visible courses`);
}

main();
