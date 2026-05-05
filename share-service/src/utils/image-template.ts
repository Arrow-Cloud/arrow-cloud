import { PlayData } from '../services/play-data';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HARD_EX_SCORING_SYSTEM, EX_SCORING_SYSTEM, MONEY_SCORING_SYSTEM } from '@api/utils/scoring';
import { JUDGMENT_COLORS } from '@api/utils/chartjs-timing-visualizer';
import { escapeHtml, safeUrl } from './escape';

// ITG-specific colors: all Fantastics are blue
const ITG_JUDGMENT_COLORS: Record<string, string> = {
  ...JUDGMENT_COLORS,
  'Fantastic (23ms)': '#21CCE8', // ITG uses blue for all Fantastic windows
};

/**
 * Get the judgment color based on scoring system.
 */
function getJudgmentColor(judgmentName: string, scoringSystem: string): string {
  if (scoringSystem?.toLowerCase() === 'itg') {
    return ITG_JUDGMENT_COLORS[judgmentName] || JUDGMENT_COLORS[judgmentName] || '#666666';
  }
  return JUDGMENT_COLORS[judgmentName] || '#666666';
}

/**
 * Get a map of which judgment windows are disabled based on the disabledWindows modifier string.
 */
function getDisabledWindowsMap(disabledWindows: string | undefined | null): Record<string, boolean> {
  const value = disabledWindows || '';
  return {
    Decent: value === 'Decents + Way Offs' || value === 'Decents',
    'Way Off': value === 'Decents + Way Offs' || value === 'Way Offs',
    'Fantastic (10ms)': value === 'Fantastics + Excellents',
    'Fantastic (15ms)': value === 'Fantastics + Excellents',
    'Fantastic (23ms)': value === 'Fantastics + Excellents',
    Excellent: value === 'Fantastics + Excellents',
  };
}

const getMisoFontBase64 = (() => {
  let cached: string | null = null;
  return () => {
    if (!cached) {
      try {
        const fontPath = join(process.cwd(), 'assets/fonts/miso-light.woff2');
        const fontBuffer = readFileSync(fontPath);
        cached = fontBuffer.toString('base64');
      } catch {
        console.warn('Failed to load Miso Light font, falling back to system fonts');
        cached = '';
      }
    }
    return cached;
  };
})();

const getNumberFontBase64 = (() => {
  let cached: string | null = null;
  return () => {
    if (!cached) {
      try {
        const fontPath = join(process.cwd(), 'assets/fonts/Nunito-VariableFont_wght.woff2');
        const fontBuffer = readFileSync(fontPath);
        cached = fontBuffer.toString('base64');
      } catch {
        console.warn('Failed to load number font, falling back to system fonts');
        cached = '';
      }
    }
    return cached;
  };
})();

function getGradeImage(grade: string): string {
  const baseUrl = 'https://assets.arrowcloud.dance/grades/';
  switch (grade.toLowerCase()) {
    case 'sex':
    case 'sext':
    case 'hex':
      return `${baseUrl}6star.png`;
    case 'quint':
      return `${baseUrl}5star.png`;
    case 'quad':
      return `${baseUrl}4star.png`;
    case 'tristar':
      return `${baseUrl}3star.png`;
    case 'twostar':
      return `${baseUrl}2star.png`;
    case 'star':
      return `${baseUrl}star.png`;
    case 's+':
      return `${baseUrl}s-plus.png`;
    case 's':
      return `${baseUrl}s.png`;
    case 's-':
      return `${baseUrl}s-minus.png`;
    case 'a+':
      return `${baseUrl}a-plus.png`;
    case 'a':
      return `${baseUrl}a.png`;
    case 'a-':
      return `${baseUrl}a-minus.png`;
    case 'b+':
      return `${baseUrl}b-plus.png`;
    case 'b':
      return `${baseUrl}b.png`;
    case 'b-':
      return `${baseUrl}b-minus.png`;
    case 'c+':
      return `${baseUrl}c-plus.png`;
    case 'c':
      return `${baseUrl}c.png`;
    case 'c-':
      return `${baseUrl}c-minus.png`;
    case 'd':
      return `${baseUrl}d.png`;
    case 'f':
      return `${baseUrl}f.png`;
    default:
      return `${baseUrl}d.png`;
  }
}

function getDifficultyColor(difficulty?: string | null): string {
  switch (difficulty?.toLowerCase()) {
    case 'beginner':
      return '#2563EB'; // blue-600
    case 'easy':
      return '#16A34A'; // green-600
    case 'medium':
      return '#CA8A04'; // yellow-600
    case 'hard':
      return '#EA580C'; // orange-600
    case 'challenge':
    case 'expert':
      return '#DC2626'; // red-600
    case 'edit':
      return '#7C3AED'; // violet-600
    default:
      return '#4B5563'; // gray-600
  }
}

/**
 * Maps stepsType to a short abbreviation
 * S = dance-single, D = dance-double, PS = pump-single, PD = pump-double
 */
function getStepsTypeAbbrev(stepsType?: string | null): string {
  switch (stepsType?.toLowerCase()) {
    case 'dance-single':
      return 'S';
    case 'dance-double':
      return 'D';
    case 'pump-single':
      return 'PS';
    case 'pump-double':
      return 'PD';
    case 'dance-couple':
      return 'DC';
    case 'dance-routine':
      return 'DR';
    case 'lights-cabinet':
      return 'LC';
    default:
      if (stepsType) {
        const parts = stepsType.split('-');
        if (parts.length >= 2) {
          return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return stepsType.slice(0, 2).toUpperCase();
      }
      return '?';
  }
}

/**
 * Maps difficulty to a single-letter abbreviation
 * B = beginner, E = easy, M = medium, H = hard, X = challenge/expert, Ed = edit
 */
function getDifficultyAbbrev(difficulty?: string | null): string {
  switch (difficulty?.toLowerCase()) {
    case 'beginner':
      return 'B';
    case 'easy':
      return 'E';
    case 'medium':
      return 'M';
    case 'hard':
      return 'H';
    case 'challenge':
    case 'expert':
      return 'X';
    case 'edit':
      return 'Ed';
    default:
      return difficulty?.[0]?.toUpperCase() || '?';
  }
}

function darkenColor(hex: string, amount: number = 0.6): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.floor((num >> 16) * amount);
  const g = Math.floor(((num >> 8) & 0x00ff) * amount);
  const b = Math.floor((num & 0x0000ff) * amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function getScoringSystemColor(system: string): string {
  switch (system.toUpperCase()) {
    case 'H.EX':
      return '#FF69B4'; // Pink
    case 'EX':
      return '#21CCE8'; // Blue
    case 'ITG':
    case 'MONEY':
      return '#FFFFFF'; // White
    default:
      return '#21CCE8'; // Default to EX blue
  }
}

export async function generateImageHTML(play: PlayData): Promise<string> {
  const primaryScorePercent = parseFloat(play.primaryScore.score).toFixed(2);
  const secondaryScorePercent = play.secondaryScore ? parseFloat(play.secondaryScore.score).toFixed(2) : null;
  const primaryColor = getScoringSystemColor(play.primaryScore.system);
  const secondaryColor = play.secondaryScore ? getScoringSystemColor(play.secondaryScore.system) : '#FFFFFF';

  // Format date in user's timezone (fallback to UTC)
  const userTimezone = play.user.timezone || 'UTC';
  let formattedDate: string;
  try {
    formattedDate = new Date(play.createdAt).toLocaleString('en-US', {
      timeZone: userTimezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    // Fallback to UTC if timezone is invalid
    formattedDate = new Date(play.createdAt).toLocaleString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  // Default gradient - will be replaced by color extraction in image generator
  const gradientColors = ['#0f172a', '#1e293b'];

  // Select scoring system based on primary system
  const systemUpper = play.primaryScore.system.toUpperCase();
  const scoringSystem =
    systemUpper === 'H.EX' || systemUpper === 'HARDEX'
      ? HARD_EX_SCORING_SYSTEM
      : systemUpper === 'ITG' || systemUpper === 'MONEY'
        ? MONEY_SCORING_SYSTEM
        : EX_SCORING_SYSTEM;

  const timingWindows = scoringSystem.windows;

  // Order judgments based on the selected system
  const judgmentOrder = timingWindows.map((w) => w.name).concat(['Miss']);

  // Find the maximum number of digits in any judgment count (minimum 4)
  const maxDigits = Math.max(
    4,
    ...judgmentOrder.filter((j: string) => play.primaryScore.judgments[j] !== undefined).map((j: string) => String(play.primaryScore.judgments[j] || 0).length),
  );

  // Get disabled windows map from modifiers
  const disabledWindows = getDisabledWindowsMap(play.modifiers?.disabledWindows);

  const judgmentRows = judgmentOrder
    .filter((j: string) => play.primaryScore.judgments[j] !== undefined)
    .map((j: string) => {
      const count = play.primaryScore.judgments[j] || 0;
      const isDisabled = disabledWindows[j] || false;
      const color = isDisabled ? '#555555' : getJudgmentColor(j, play.primaryScore.system);
      const rowOpacity = isDisabled ? 'opacity: 0.5;' : '';
      const countStr = String(count);
      const paddingNeeded = maxDigits - countStr.length;

      // When disabled, leading zeros use same color as digits (no highlight distinction)
      const leadingZeroColor = isDisabled ? color : darkenColor(color, 0.25);

      let displayValue = '';
      if (paddingNeeded > 0) {
        const leadingZeros = '0'.repeat(paddingNeeded);
        displayValue = leadingZeros
          .split('')
          .map((d) => `<span class="digit" style="color: ${leadingZeroColor};">${d}</span>`)
          .join('');
      }
      displayValue += countStr
        .split('')
        .map((d) => `<span class="digit">${d}</span>`)
        .join('');

      return `
        <div class="judgment" style="${rowOpacity}">
          <span class="judgment-label" style="color: ${color};">${j}</span>
          <span class="judgment-count" style="color: ${color};">${displayValue}</span>
        </div>
      `;
    })
    .join('');

  // Prepare timing chart data using the selected system's windows
  const chartData: { x: number; y: number; color: string }[] = [];
  const missTimes: number[] = [];
  if (play.timingData && play.timingData.length > 0) {
    for (const [t, off] of play.timingData) {
      if (off === 'Miss') {
        missTimes.push(t);
      } else if (typeof off === 'number') {
        const abs = Math.abs(off);
        const win = timingWindows.find((w) => abs <= w.maxOffset);
        const judgmentName = win ? win.name : 'Miss';
        const color = getJudgmentColor(judgmentName, play.primaryScore.system);
        chartData.push({ x: t, y: off * 1000, color }); // Convert to ms
      }
    }
  }

  const chartDataJSON = JSON.stringify(chartData);
  const missTimesJSON = JSON.stringify(missTimes);
  const npsDataJSON = JSON.stringify(play.npsData || []);
  const lifebarDataJSON = JSON.stringify(play.lifebarInfo || []);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    ${
      getMisoFontBase64()
        ? `
    @font-face {
      font-family: 'Miso';
      src: url(data:font/woff2;base64,${getMisoFontBase64()}) format('woff2');
      font-weight: 100 900;
      font-style: normal;
      font-display: block;
    }
    `
        : ''
    }
    ${
      getNumberFontBase64()
        ? `
    @font-face {
      font-family: 'Azeret Mono';
      src: url(data:font/woff2;base64,${getNumberFontBase64()}) format('woff2');
      font-weight: 100 900;
      font-style: normal;
      font-display: block;
    }
    `
        : ''
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      width: 880px;
      height: 800px;
      background: linear-gradient(135deg, ${gradientColors[0]} 0%, ${gradientColors[1]} 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'Noto Sans JP', sans-serif;
      color: white;
      padding: 40px;
      position: relative;
      overflow: hidden;
    }
    
    /* Apply Azeret Mono font to all numeric content */
    ${
      getNumberFontBase64()
        ? `
    .score, .stat-value, .judgment-count, .radar-value, .chart-meta {
      font-family: 'Azeret Mono', 'Courier New', monospace;
      font-weight: 600;
    }
    `
        : ''
    }
    
    /* Apply Miso font to labels only */
    ${
      getMisoFontBase64()
        ? `
    .judgment-label, .stat-label, .radar-label {
      font-family: 'Miso', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
    }
    `
        : ''
    }
    
    .user-section {
      position: absolute;
      bottom: 25px;
      right: 40px;
      width: 280px;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
      gap: 15px;
      z-index: 1;
    }
    
    .avatar {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: 3px solid rgba(255, 255, 255, 0.3);
      object-fit: cover;
      background: rgba(255, 255, 255, 0.1);
    }
    
    .user-info h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 2px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
      text-align: right;
    }
    
    .user-info .date {
      font-size: 12px;
      opacity: 0.7;
      font-weight: 400;
      text-align: right;
    }
    
    .content {
      display: flex;
      gap: 40px;
      align-items: flex-start;
      position: relative;
      z-index: 1;
    }
    
    .left-column {
      width: 480px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    
    .header-banner {
      width: 100%;
      object-fit: cover;
      border-radius: 8px;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
    }
    
    .chart-container {
      width: 100%;
      height: 220px;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    
    .timing-chart {
      width: 100% !important;
      height: 100% !important;
    }
    
    .score-info {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    
    .stats {
      width: 280px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    
    .score-section {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 0;
    }
    
    .scores-container {
      display: flex;
      flex-direction: row;
      align-items: baseline;
      gap: 20px;
    }
    
    .score-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    
    .score-label {
      font-size: 14px;
      font-weight: 700;
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .score {
      font-size: 42px;
      font-weight: 800;
      line-height: 1;
    }
    
    .score-secondary {
      font-size: 28px;
      font-weight: 700;
      line-height: 1;
      opacity: 0.85;
    }
    
    .grade {
      width: 60px;
      height: 60px;
      object-fit: contain;
      filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.3));
    }
    
    .chart-info {
      margin-bottom: 20px;
    }
    
    .chart-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 6px;
      text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
    }
    
    .chart-artist {
      font-size: 18px;
      opacity: 0.8;
      margin-bottom: 10px;
    }
    
    .chart-meta {
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 16px;
    }
    
    .difficulty-badge {
      padding: 5px 14px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 16px;
      color: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    
    .steps-type {
      font-size: 14px;
      color: #bbb;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .chart-description {
      font-size: 14px;
      color: #aaa;
      margin-left: 12px;
    }
    
    .chart-credit {
      font-size: 14px;
      color: #888;
      margin-left: 12px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 8px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    
    .stat-label {
      font-size: 16px;
      opacity: 0.7;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
    }
    
    .stat-value .unit {
      font-size: 0.45em;
      color: #666;
      margin-left: 2px;
      font-weight: 400;
    }
    
    .radar-grid {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .radar-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2px 8px;
    }
    
    .radar-item:last-child {
      border-bottom: none;
    }
    
    .radar-label {
      flex: 1;
      font-weight: 400;
      opacity: 0.9;
      font-size: 16px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .radar-value {
      font-weight: 800;
      font-size: 20px;
      min-width: 80px;
      text-align: right;
      color: #ffffff;
    }
    
    .judgments {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .judgment {
      display: flex;
      align-items: center;
      font-size: 16px;
      padding: 0px 8px;
    }
    
    .judgment:last-child {
      border-bottom: none;
    }
    
    .judgment-label {
      flex: 1;
      font-weight: 400;
      opacity: 0.9;
      font-size: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .judgment-count {
      font-weight: 800;
      font-size: 36px;
      min-width: 80px;
      text-align: right;
    }
    
    .judgment-count .digit {
      display: inline-block;
      width: 0.6em;
      text-align: center;
    }
    
    .footer {
      position: absolute;
      bottom: 25px;
      left: 40px;
      display: flex;
      align-items: center;
      gap: 15px;
      opacity: 0.7;
    }
    
    .footer-logo {
      height: 40px;
      width: auto;
    }
    
    .footer-text {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    
    .bg-decoration {
      position: absolute;
      top: -100px;
      right: -100px;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(96, 165, 250, 0.1) 0%, transparent 70%);
      border-radius: 50%;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="bg-decoration"></div>
  
  <div class="content">
    <div class="left-column">
      ${
        play.chart.bannerUrl
          ? `<img src="${safeUrl(play.chart.bannerUrl)}" alt="${escapeHtml(play.chart.title)}" class="header-banner" />`
          : `<div class="header-banner" style="display: flex; align-items: center; justify-content: center; font-size: 48px; opacity: 0.3; background: rgba(255, 255, 255, 0.05); aspect-ratio: 2.56;">🎵</div>`
      }
      
      <div class="score-info">
        <div class="score-section">
          ${play.primaryScore.grade ? `<img src="${safeUrl(getGradeImage(play.primaryScore.grade))}" alt="${escapeHtml(play.primaryScore.grade)}" class="grade" />` : ''}
          <div class="scores-container">
            <div class="score-row">
              <div class="score" style="color: ${primaryColor};">${primaryScorePercent}</div>
              <span class="score-label" style="color: ${primaryColor};">${escapeHtml(play.primaryScore.system)}</span>
            </div>
            ${
              secondaryScorePercent
                ? `
            <div class="score-row">
              <div class="score-secondary" style="color: ${secondaryColor};">${secondaryScorePercent}</div>
              <span class="score-label" style="color: ${secondaryColor};">${escapeHtml(play.secondaryScore!.system)}</span>
            </div>
            `
                : ''
            }
          </div>
        </div>
        
        <div class="chart-info">
          <div class="chart-title">${escapeHtml(play.chart.title)}</div>
          <div class="chart-artist">${escapeHtml(play.chart.artist)}</div>
          <div class="chart-meta">
            ${
              play.chart.stepsType || play.chart.difficulty || play.chart.meter
                ? `<span class="difficulty-badge" style="background-color: ${getDifficultyColor(play.chart.difficulty)};">${escapeHtml(getStepsTypeAbbrev(play.chart.stepsType))}${escapeHtml(getDifficultyAbbrev(play.chart.difficulty))} ${escapeHtml(play.chart.meter ?? '?')}</span>`
                : ''
            }
            ${play.chart.description ? `<span class="chart-description">${escapeHtml(play.chart.description)}</span>` : ''}
            ${play.chart.credit ? `<span class="chart-credit">${escapeHtml(play.chart.credit)}</span>` : ''}
          </div>
        </div>
      </div>
      ${chartData.length > 0 ? '<div class="chart-container"><canvas id="timingChart" class="timing-chart"></canvas></div>' : ''}
    </div>
    
    <div class="stats">
      ${
        play.timingStats
          ? `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">Mean Abs.</div>
          <div class="stat-value">${play.timingStats.meanAbsMs.toFixed(2)}<span class="unit">ms</span></div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Mean Offset</div>
          <div class="stat-value">${play.timingStats.meanMs.toFixed(2)}<span class="unit">ms</span></div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Std.Dev.^3</div>
          <div class="stat-value">${(play.timingStats.stdMs * 3).toFixed(2)}<span class="unit">ms</span></div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Max Error</div>
          <div class="stat-value">${play.timingStats.maxErrMs.toFixed(2)}<span class="unit">ms</span></div>
        </div>
      </div>`
          : ''
      }
      
      <div class="judgments">
        ${judgmentRows}
      </div>
      ${
        play.radar
          ? `
      <div class="radar-grid">
        <div class="radar-item">
          <div class="radar-label">Holds Held</div>
          <div class="radar-value">${play.radar.holdsHeld}/${play.radar.holdsTotal}</div>
        </div>
        <div class="radar-item">
          <div class="radar-label">Rolls Hit</div>
          <div class="radar-value">${play.radar.rollsHit}/${play.radar.rollsTotal}</div>
        </div>
        <div class="radar-item">
          <div class="radar-label">Mines Dodged</div>
          <div class="radar-value">${play.radar.minesDodged}/${play.radar.minesTotal}</div>
        </div>
      </div>`
          : ''
      }
    </div>
  </div>
  
  <div class="footer">
    <img src="https://assets.arrowcloud.dance/logos/20250725/ac%20logo.png" alt="Arrow Cloud" class="footer-logo" />
    <span class="footer-text">arrowcloud.dance/play/${play.id}</span>
  </div>
  
  <div class="user-section">
    <div class="user-info">
      <h1>${escapeHtml(play.user.alias)}</h1>
      <div class="date">${formattedDate}</div>
    </div>
    ${
      play.user.profileImageUrl
        ? `<img src="${safeUrl(play.user.profileImageUrl)}" alt="${escapeHtml(play.user.alias)}" class="avatar" />`
        : `<div class="avatar" style="display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; background: rgba(255, 255, 255, 0.2);">${escapeHtml(play.user.alias.charAt(0).toUpperCase())}</div>`
    }
  </div>
  
  <script>
    const chartData = ${chartDataJSON};
    const missTimes = ${missTimesJSON};
    const npsData = ${npsDataJSON};
    const lifebarData = ${lifebarDataJSON};
    
    if (chartData.length > 0) {
      const ctx = document.getElementById('timingChart');
      
      const datasets = [];
      const colorGroups = {};
      
      let maxAbsY = 0;
      chartData.forEach(point => {
        maxAbsY = Math.max(maxAbsY, Math.abs(point.y));
        if (!colorGroups[point.color]) {
          colorGroups[point.color] = [];
        }
        colorGroups[point.color].push({ x: point.x, y: point.y });
      });
      
      if (npsData.length > 0) {
        datasets.push({
          label: 'NPS',
          data: npsData,
          type: 'line',
          fill: 'start',
          tension: 0.15,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 1,
          borderColor: '#6a0dad99',
          yAxisID: 'yNps',
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return 'rgba(106,13,173,0.15)';
            const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(128,0,255,0.15)');
            gradient.addColorStop(1, 'rgba(0,128,255,0.05)');
            return gradient;
          },
        });
      }
      
      Object.entries(colorGroups).forEach(([color, data]) => {
        datasets.push({
          data: data,
          backgroundColor: color,
          borderColor: color,
          pointRadius: 1.5,
          pointHoverRadius: 1.5,
          showLine: false,
        });
      });
      
      const yRange = maxAbsY * 1.2;
      missTimes.forEach(x => {
        datasets.push({
          label: '',
          data: [
            { x, y: -yRange },
            { x, y: yRange },
          ],
          backgroundColor: 'rgba(255, 48, 48, 0.4)',
          borderColor: 'rgba(255, 48, 48, 0.4)',
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 0,
          showLine: true,
          fill: false,
          type: 'line',
          tension: 0,
        });
      });
      
      if (lifebarData.length > 0) {
        datasets.push({
          label: 'Lifebar %',
          data: lifebarData,
          borderColor: '#FFFFFF',
          backgroundColor: 'rgba(255, 107, 107, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
          showLine: true,
          fill: false,
          type: 'line',
          yAxisID: 'y1',
          tension: 0.25,
        });
      }
      
      new Chart(ctx, {
        type: 'scatter',
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              type: 'linear',
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { display: false }
            },
            y: {
              type: 'linear',
              min: -maxAbsY * 1.2,
              max: maxAbsY * 1.2,
              grid: { 
                color: (ctx) => {
                  if (ctx.tick.value === 0) return '#888';
                  const windows = [15, 23, 44.5, 103.5, 136.5, 181.5];
                  const val = Math.abs(ctx.tick.value);
                  if (windows.some(w => Math.abs(w - val) < 1)) {
                    return 'rgba(255, 255, 255, 0.2)';
                  }
                  return 'rgba(255, 255, 255, 0.05)';
                }
              },
              ticks: { display: false }
            },
            yNps: {
              type: 'linear',
              display: false,
              position: 'right',
              grid: { display: false },
            },
            y1: {
              type: 'linear',
              display: false,
              position: 'right',
              min: 0,
              max: 100,
              grid: { display: false },
            }
          },
          layout: {
            padding: {
              top: 5,
              right: 0,
              bottom: 0,
              left: 0
            }
          }
        }
      });
    }
  </script>
</body>
</html>`;
}
