#!/usr/bin/env tsx
/**
 * Turns scripts/assign-golf-pars.ts's output JSON (par per chart, keyed by chartHash) into a real
 * `Golf.ini` per pack - the file Themes/ArrowCloudTheme/Scripts/SL-GolfHelpers.lua's Golf.GetPar
 * reads in-game. Format confirmed against the real example already in "In The Golf - Quint Bait":
 *
 *   [SongFolderName]
 *   Par=3
 *   [SongFolderName:Challenge]
 *   Par=4
 *
 * Section names are the song's folder name, optionally suffixed ":<Difficulty>" (Beginner/Easy/
 * Medium/Hard/Challenge/Edit) for a per-chart override.
 *
 * A song folder with only one chart gets a single bare `[SongFolder]` section - there's nothing to
 * disambiguate. A song folder with multiple charts (e.g. a song charted at both Hard and Challenge)
 * gets one explicit `[SongFolder:Difficulty]` section per chart instead of a bare section - safer
 * than relying on a bare section as a "default" that only some charts override, since that requires
 * assuming fallback behavior this script has no way to re-verify against the live Lua reader.
 *
 * This only writes local output files - moving them into each pack's actual folder is a manual step
 * (per the user's own preference), not something this script does.
 *
 * Usage:
 *   npx tsx scripts/generate-golf-ini.ts [<pars.json> ...] [--out-dir <dir>]
 *
 * Examples:
 *   npx tsx scripts/generate-golf-ini.ts
 *     (defaults to both scripts/data/golf-beta-hills-pars.json and golf-beta-pines-pars.json)
 *   npx tsx scripts/generate-golf-ini.ts scripts/data/golf-beta-hills-pars.json --out-dir /tmp/ini
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

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

// The finalized beta par sets. The earlier non-"-final" files are kept only as history (they hold
// stale vE2-era pars for charts vF3 dropped) - don't regenerate from those.
const DEFAULT_INPUTS = ['scripts/data/golf-beta-hills-pars-final.json', 'scripts/data/golf-beta-pines-pars-final.json'];

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

// Section names are written as the song's folder name VERBATIM - no sanitizing, including when the
// name itself contains `[` or `]` (real example: "Komm, Susser Tod - [Zaia]", a real Beta Hills
// folder).
//
// An earlier version stripped both bracket characters, on the theory that they'd corrupt the
// `[SongFolder]` header's own delimiters. That was wrong, and it silently broke par lookup for
// exactly that song: the reader is Lua, not C++ (Themes/_fallback/Scripts/01 IniFile.lua - the
// engine's `IniFile` global), and it parses a section with
//
//     local sec = str:match( "^%[(.+)%]" )
//
// which is anchored at the start of the line and greedy, so the capture always extends to the LAST
// `]` on the line. `[Komm, Susser Tod - [Zaia]]` therefore yields exactly "Komm, Susser Tod -
// [Zaia]", brackets intact. Stripping them instead produced a section key that could never match,
// since SL-GolfHelpers.lua's Golf.GetPar looks the par up by `Basename(song:GetSongDir())` - the
// real folder name, brackets and all - so that hole just showed no par at all.
//
// Verified for every real vF4 song folder: a bracket anywhere in the name (leading, trailing, or
// interior) round-trips, because the pattern only needs the line to start with `[` and end with
// `]`, which wrapping always guarantees.
function sectionNameFor(name: string): string {
  return name;
}

function buildIni(entries: ParEntry[]): string {
  const bySongFolder = new Map<string, ParEntry[]>();
  for (const entry of entries) {
    if (entry.par == null) continue; // unanswered/skipped chart - nothing to write
    if (!bySongFolder.has(entry.songFolder)) bySongFolder.set(entry.songFolder, []);
    bySongFolder.get(entry.songFolder)!.push(entry);
  }

  const songFolders = [...bySongFolder.keys()].sort((a, b) => a.localeCompare(b));
  const lines: string[] = [];
  for (const songFolder of songFolders) {
    const charts = bySongFolder.get(songFolder)!.sort((a, b) => a.difficulty.localeCompare(b.difficulty));
    const section = sectionNameFor(songFolder);
    if (charts.length === 1) {
      lines.push(`[${section}]`, `Par=${charts[0].par}`, '');
    } else {
      for (const chart of charts) {
        lines.push(`[${section}:${capitalize(chart.difficulty)}]`, `Par=${chart.par}`, '');
      }
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const inputs: string[] = [];
  let outDir = 'scripts/output/golf-ini';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out-dir') {
      outDir = args[++i];
    } else {
      inputs.push(args[i]);
    }
  }

  const files = inputs.length > 0 ? inputs : DEFAULT_INPUTS;
  mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    const entries: ParEntry[] = JSON.parse(readFileSync(file, 'utf-8'));
    if (entries.length === 0) {
      console.error(`⚠️  ${file}: no entries, skipping`);
      continue;
    }
    const packName = entries[0].pack;
    const unassigned = entries.filter((e) => e.par == null).length;
    const ini = buildIni(entries);

    const outFile = join(outDir, `${packName}.Golf.ini`);
    writeFileSync(outFile, ini);
    console.log(`📦 ${packName}: wrote ${outFile} (${entries.length - unassigned}/${entries.length} charts assigned)`);
    if (unassigned > 0) {
      console.log(`   ⚠️  ${unassigned} chart(s) still unassigned (par: null) - not included in the ini.`);
    }
  }

  console.log(`\nDone. Move each *.Golf.ini file into its pack's folder as "Golf.ini" yourself.`);
}

main();
