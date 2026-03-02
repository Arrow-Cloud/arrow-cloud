/**
 * Chart hash calculation implementation
 * May evolve to more general simfile parsing later
 *
 * Algorithm based on Simply Love, ported to TypeScript
 * Reference: https://github.com/Simply-Love/Simply-Love-SM5
 */

import { createHash } from 'crypto';

export interface ChartMetadata {
  stepsType: string;
  description: string;
  difficulty: string;
  meter: number;
  chartName?: string;
  credit?: string;
  radarValues?: string;
  bpms?: string; // Chart-specific BPMs
}

export interface SimfileMetadata {
  title: string;
  subtitle?: string;
  artist: string;
  genre?: string;
  credit?: string;
  music?: string;
  banner?: string;
  background?: string;
  offset?: number;
  bpms: string;
  stops?: string;
  version?: string;
}

export class Chart {
  metadata: ChartMetadata;
  noteData: string;
  private simfile: Simfile;

  constructor(metadata: ChartMetadata, noteData: string, simfile: Simfile) {
    this.metadata = metadata;
    this.noteData = noteData;
    this.simfile = simfile;
  }

  calculateHash(): string {
    // Get the chart-specific BPMs or fall back to simfile BPMs
    const bpms = this.metadata.bpms || this.simfile.metadata.bpms;

    // Minimize the chart data
    const minimizedChart = this.minimizeChart(this.noteData);

    // Normalize BPMs
    const normalizedBpms = Chart.normalizeFloatDigits(bpms);

    // Calculate SHA1 hash of chart + BPMs and take first 16 characters
    const hashInput = minimizedChart + normalizedBpms;
    const hash = createHash('sha1').update(hashInput).digest('hex');

    return hash.substring(0, 16);
  }

  private minimizeChart(chartString: string): string {
    const finalChartData: string[] = [];
    let currentMeasure: string[] = [];

    // Normalize line endings and split by lines
    const lines = chartString.replace(/\r\n?/g, '\n').split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) continue;

      // If we hit a comma or semicolon, end of measure
      if (trimmedLine === ',' || trimmedLine === ';') {
        if (currentMeasure.length > 0) {
          this.minimizeMeasure(currentMeasure);
          finalChartData.push(...currentMeasure);
          if (trimmedLine === ',') {
            finalChartData.push(',');
          }
          currentMeasure = [];
        }
      } else {
        currentMeasure.push(trimmedLine);
      }
    }

    // Add final measure if it exists
    if (currentMeasure.length > 0) {
      this.minimizeMeasure(currentMeasure);
      finalChartData.push(...currentMeasure);
    }

    return finalChartData.join('\n');
  }

  private minimizeMeasure(measure: string[]): void {
    let minimal = false;

    while (!minimal && measure.length % 2 === 0) {
      let allZeroes = true;

      // Check if every other line (starting from index 1) is all zeros
      for (let i = 1; i < measure.length; i += 2) {
        if (measure[i] !== '0'.repeat(measure[i].length)) {
          allZeroes = false;
          break;
        }
      }

      if (allZeroes) {
        // Remove every other element starting from index 1
        const newMeasure: string[] = [];
        for (let i = 0; i < measure.length; i += 2) {
          newMeasure.push(measure[i]);
        }
        measure.length = 0;
        measure.push(...newMeasure);
      } else {
        minimal = true;
      }
    }
  }

  public static normalizeFloatDigits(param: string): string {
    const paramParts: string[] = [];
    const parts = param.split(',');

    for (const beatBpm of parts) {
      const match = beatBpm.match(/(.+)=(.+)/);
      if (match) {
        const beat = Chart.normalizeDecimal(match[1]);
        const bpm = Chart.normalizeDecimal(match[2]);
        paramParts.push(`${beat}=${bpm}`);
      }
    }

    return paramParts.join(',');
  }

  private static normalizeDecimal(decimal: string): string {
    // Remove control characters
    /* eslint-disable-next-line no-control-regex */
    const cleaned = decimal.replace(/[\x00-\x1F\x7F]/g, '');
    const num = parseFloat(cleaned);

    // Round to 3 decimal places
    const rounded = Math.round(num * 1000) / 1000;
    return rounded.toFixed(3);
  }
}

export class Simfile {
  metadata: SimfileMetadata;
  charts: Chart[];
  private rawContent: string;
  private fileType: 'ssc' | 'sm';

  constructor(content: string) {
    this.rawContent = content;
    // Determine file type based on content structure
    this.fileType = content.includes('#NOTEDATA:') ? 'ssc' : 'sm';
    this.metadata = this.parseMetadata(content);
    this.charts = this.parseCharts(content);
  }

  /**
   * Calculate a hash of the entire simfile content
   * This provides a unique identifier for the simfile regardless of pack
   */
  calculateHash(): string {
    // Normalize the content for consistent hashing
    const normalizedContent = this.rawContent
      .replace(/\r\n/g, '\n') // Normalize line endings
      .trim();

    return createHash('sha256').update(normalizedContent, 'utf8').digest('hex');
  }

  private parseMetadata(content: string): SimfileMetadata {
    const metadata: SimfileMetadata = {
      title: '',
      artist: '',
      bpms: '0.000=120.000',
    };

    // Parse basic metadata using case-insensitive regex
    const patterns = {
      title: /#TITLE\s*:\s*(.*?)\s*;/i,
      subtitle: /#SUBTITLE\s*:\s*(.*?)\s*;/i,
      artist: /#ARTIST\s*:\s*(.*?)\s*;/i,
      genre: /#GENRE\s*:\s*(.*?)\s*;/i,
      credit: /#CREDIT\s*:\s*(.*?)\s*;/i,
      music: /#MUSIC\s*:\s*(.*?)\s*;/i,
      banner: /#BANNER\s*:\s*(.*?)\s*;/i,
      background: /#BACKGROUND\s*:\s*(.*?)\s*;/i,
      offset: /#OFFSET\s*:\s*(.*?)\s*;/i,
      bpms: /#BPMS\s*:\s*(.*?)\s*;/is, // Add 's' flag for multiline BPMs
      stops: /#STOPS\s*:\s*(.*?)\s*;/is, // Add 's' flag for multiline STOPS
      version: /#VERSION\s*:\s*(.*?)\s*;/i,
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = content.match(pattern);
      if (match && match[1].trim()) {
        const value = match[1].trim();
        switch (key) {
          case 'title':
            metadata.title = value;
            break;
          case 'subtitle':
            metadata.subtitle = value;
            break;
          case 'artist':
            metadata.artist = value;
            break;
          case 'genre':
            metadata.genre = value;
            break;
          case 'credit':
            metadata.credit = value;
            break;
          case 'music':
            metadata.music = value;
            break;
          case 'banner':
            metadata.banner = value;
            break;
          case 'background':
            metadata.background = value;
            break;
          case 'offset':
            metadata.offset = parseFloat(value);
            break;
          case 'bpms':
            // Remove newlines and extra whitespace from BPMs
            metadata.bpms = value.replace(/\s+/g, '');
            break;
          case 'stops':
            metadata.stops = value;
            break;
          case 'version':
            metadata.version = value;
            break;
        }
      }
    }

    return metadata;
  }

  private parseCharts(content: string): Chart[] {
    const charts: Chart[] = [];

    if (this.fileType === 'ssc') {
      charts.push(...this.parseSscCharts(content));
    } else {
      charts.push(...this.parseSmCharts(content));
    }

    return charts;
  }

  private parseSscCharts(content: string): Chart[] {
    const charts: Chart[] = [];

    // Find all NOTEDATA sections
    const noteDataPattern = /#NOTEDATA:.*?#NOTES2?:[^;]*/gis;
    const matches = content.match(noteDataPattern);

    if (!matches) return charts;

    for (const noteDataSection of matches) {
      const normalizedSection = noteDataSection.replace(/\r\n?/g, '\n');

      // Parse chart metadata
      const stepsType = this.extractValue(normalizedSection, 'STEPSTYPE') || '';
      const difficulty = this.extractValue(normalizedSection, 'DIFFICULTY') || '';
      const description = this.extractValue(normalizedSection, 'DESCRIPTION') || '';
      const meterStr = this.extractValue(normalizedSection, 'METER') || '1';
      const meter = parseInt(meterStr, 10);
      const chartName = this.extractValue(normalizedSection, 'CHARTNAME');
      const credit = this.extractValue(normalizedSection, 'CREDIT');
      const radarValues = this.extractValue(normalizedSection, 'RADARVALUES');

      // Check for chart-specific BPMs
      const chartBpms = this.extractValue(normalizedSection, 'BPMS');
      let normalizedChartBpms: string | undefined;
      if (chartBpms) {
        // Remove newlines and extra whitespace from BPMs
        const cleanedBpms = chartBpms.replace(/\s+/g, '');
        normalizedChartBpms = Chart.normalizeFloatDigits(cleanedBpms);
      }

      // Extract note data - match everything from #NOTES: to end of section
      const notesMatch = normalizedSection.match(/#NOTES2?:\s*\n([\s\S]*?)$/i);
      if (!notesMatch) continue;

      const noteData = notesMatch[1]
        .replace(/\/\/[^\n]*/g, '') // Remove comments
        .replace(/[\r\t\f\v ]+/g, '') // Remove whitespace except newlines
        .trim();

      const chartMetadata: ChartMetadata = {
        stepsType: stepsType.toLowerCase(),
        difficulty: difficulty.toLowerCase(),
        description,
        meter,
        chartName,
        credit,
        radarValues,
        bpms: normalizedChartBpms,
      };

      charts.push(new Chart(chartMetadata, noteData, this));
    }

    return charts;
  }

  private parseSmCharts(content: string): Chart[] {
    const charts: Chart[] = [];

    // Find all NOTES sections
    const notesPattern = /#NOTES2?[^;]*/gis;
    const matches = content.match(notesPattern);

    if (!matches) return charts;

    for (const notesSection of matches) {
      const normalizedSection = notesSection.replace(/\r\n?/g, '\n');

      // Split on colons to get parts
      const parts = (normalizedSection + ':').split(':');

      if (parts.length >= 7) {
        const stepsType = parts[1].replace(/[^\w-]/g, '').toLowerCase();
        const difficulty = parts[3].replace(/[^\w]/g, '').toLowerCase();
        const description = parts[2].trim();
        const meterStr = parts[4] || '1';
        const meter = parseInt(meterStr, 10);

        const noteData = parts[6]
          .replace(/\/\/[^\n]*/g, '') // Remove comments
          .replace(/[\r\t\f\v ]+/g, '') // Remove whitespace except newlines
          .trim();

        const chartMetadata: ChartMetadata = {
          stepsType,
          difficulty,
          description,
          meter,
        };

        charts.push(new Chart(chartMetadata, noteData, this));
      }
    }

    return charts;
  }

  private extractValue(content: string, field: string): string | undefined {
    const pattern = new RegExp(`#${field}\\s*:\\s*(.*?)\\s*;`, 'is');
    const match = content.match(pattern);

    if (match && match[1].trim()) {
      return match[1].trim();
    }

    return undefined;
  }
}
