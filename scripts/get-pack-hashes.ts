/**
 * Script to generate chart hashes for a locally stored pack of simfiles
 *
 * Usage: ts-node scripts/get-pack-hashes.ts <path-to-pack>
 *
 * The pack directory should contain nested song folders, where each song folder
 * contains a .ssc (or .sm) file for hash calculation.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';
import { Simfile } from '../api/src/utils/simfile/calc-hash';

interface ChartInfo {
  hash: string;
  stepsType: string;
  difficulty: string;
  meter: number;
  description: string;
  songFolder: string;
  simfileName: string;
  chartName?: string;
  credit?: string;
}

interface SimfileInfo {
  songFolder: string;
  simfileName: string;
  title: string;
  artist: string;
  charts: ChartInfo[];
  error?: string;
}

/**
 * Recursively find all simfiles (.ssc and .sm) in a directory
 */
function findSimfiles(dir: string): string[] {
  const simfiles: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Recursively search subdirectories
          simfiles.push(...findSimfiles(fullPath));
        } else if (stat.isFile()) {
          const lowerEntry = entry.toLowerCase();
          if (lowerEntry.endsWith('.ssc') || lowerEntry.endsWith('.sm')) {
            simfiles.push(fullPath);
          }
        }
      } catch (err) {
        console.error(`Error accessing ${fullPath}:`, err);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }

  return simfiles;
}

/**
 * Process a simfile and extract all chart hashes
 */
function processSimfile(simfilePath: string, packRoot: string): SimfileInfo {
  const songFolder = relative(packRoot, join(simfilePath, '..'));
  const simfileName = basename(simfilePath);

  try {
    const content = readFileSync(simfilePath, 'utf-8');
    const simfile = new Simfile(content);

    const charts: ChartInfo[] = simfile.charts.map((chart) => ({
      hash: chart.calculateHash(),
      stepsType: chart.metadata.stepsType,
      difficulty: chart.metadata.difficulty,
      meter: chart.metadata.meter,
      description: chart.metadata.description,
      chartName: chart.metadata.chartName,
      credit: chart.metadata.credit,
      songFolder,
      simfileName,
    }));

    return {
      songFolder,
      simfileName,
      title: simfile.metadata.title || 'Unknown',
      artist: simfile.metadata.artist || 'Unknown',
      charts,
    };
  } catch (error) {
    return {
      songFolder,
      simfileName,
      title: 'Error',
      artist: 'Error',
      charts: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format output for display
 */
function formatOutput(simfileInfos: SimfileInfo[], format: 'detailed' | 'csv' | 'json'): string {
  if (format === 'json') {
    // Extract all hashes into a flat array
    const hashes: string[] = [];
    for (const info of simfileInfos) {
      if (!info.error) {
        for (const chart of info.charts) {
          hashes.push(chart.hash);
        }
      }
    }
    return JSON.stringify(hashes, null, 2);
  }

  if (format === 'csv') {
    const lines: string[] = ['Hash,Song Folder,Simfile,Title,Artist,Steps Type,Difficulty,Meter,Description,Chart Name,Credit'];

    for (const info of simfileInfos) {
      if (info.error) {
        lines.push(`ERROR,${info.songFolder},${info.simfileName},${info.error},,,,,,,`);
        continue;
      }

      for (const chart of info.charts) {
        const fields = [
          chart.hash,
          chart.songFolder,
          chart.simfileName,
          info.title,
          info.artist,
          chart.stepsType,
          chart.difficulty,
          chart.meter.toString(),
          chart.description || '',
          chart.chartName || '',
          chart.credit || '',
        ];
        // Escape fields that contain commas
        const escapedFields = fields.map((f) => (f.includes(',') ? `"${f}"` : f));
        lines.push(escapedFields.join(','));
      }
    }

    return lines.join('\n');
  }

  // Detailed format (default)
  const output: string[] = [];

  for (const info of simfileInfos) {
    output.push('─'.repeat(80));
    output.push(`📁 ${info.songFolder}/`);
    output.push(`📄 ${info.simfileName}`);

    if (info.error) {
      output.push(`❌ ERROR: ${info.error}`);
      output.push('');
      continue;
    }

    output.push(`🎵 ${info.title} - ${info.artist}`);
    output.push(`📊 ${info.charts.length} chart(s)`);
    output.push('');

    for (const chart of info.charts) {
      output.push(`  🔑 ${chart.hash}`);
      output.push(`     ${chart.stepsType} / ${chart.difficulty} / ${chart.meter}`);
      if (chart.description) {
        output.push(`     Description: ${chart.description}`);
      }
      if (chart.chartName) {
        output.push(`     Chart Name: ${chart.chartName}`);
      }
      if (chart.credit) {
        output.push(`     Credit: ${chart.credit}`);
      }
      output.push('');
    }
  }

  return output.join('\n');
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/get-pack-hashes.ts <path-to-pack> [--format=detailed|csv|json]');
    console.error('');
    console.error('Options:');
    console.error('  --format=detailed  Human-readable detailed output (default)');
    console.error('  --format=csv       CSV format for spreadsheet import');
    console.error('  --format=json      JSON format for programmatic use');
    process.exit(1);
  }

  const packPath = args[0];
  let format: 'detailed' | 'csv' | 'json' = 'detailed';

  // Parse format option
  for (const arg of args.slice(1)) {
    if (arg.startsWith('--format=')) {
      const formatValue = arg.split('=')[1];
      if (formatValue === 'csv' || formatValue === 'json' || formatValue === 'detailed') {
        format = formatValue;
      } else {
        console.error(`Invalid format: ${formatValue}`);
        process.exit(1);
      }
    }
  }

  // Check if path exists
  try {
    const stat = statSync(packPath);
    if (!stat.isDirectory()) {
      console.error(`Error: ${packPath} is not a directory`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: Cannot access ${packPath}`);
    console.error(err);
    process.exit(1);
  }

  console.error(`🔍 Scanning for simfiles in: ${packPath}`);
  const simfilePaths = findSimfiles(packPath);
  console.error(`📝 Found ${simfilePaths.length} simfile(s)\n`);

  if (simfilePaths.length === 0) {
    console.error('No .ssc or .sm files found in the specified directory.');
    process.exit(0);
  }

  // Process all simfiles
  const simfileInfos: SimfileInfo[] = [];
  let totalCharts = 0;
  let errorCount = 0;

  for (const simfilePath of simfilePaths) {
    const info = processSimfile(simfilePath, packPath);
    simfileInfos.push(info);

    if (info.error) {
      errorCount++;
    } else {
      totalCharts += info.charts.length;
    }
  }

  // Output results
  console.log(formatOutput(simfileInfos, format));

  // Print summary to stderr so it doesn't interfere with piped output
  if (format !== 'json' && format !== 'csv') {
    console.error('─'.repeat(80));
  }
  console.error(`\n✅ Summary:`);
  console.error(`   Simfiles processed: ${simfilePaths.length}`);
  console.error(`   Total charts: ${totalCharts}`);
  if (errorCount > 0) {
    console.error(`   Errors: ${errorCount}`);
  }
}

// Run the script
main();
