import { SessionData, SessionPlayData } from '../services/session-data';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HARD_EX_SCORING_SYSTEM, EX_SCORING_SYSTEM, MONEY_SCORING_SYSTEM } from '@api/utils/scoring';
import { JUDGMENT_COLORS } from '@api/utils/chartjs-timing-visualizer';

// ITG-specific colors: all Fantastics are blue
const ITG_JUDGMENT_COLORS: Record<string, string> = {
  ...JUDGMENT_COLORS,
  'Fantastic (23ms)': '#21CCE8',
};

function getJudgmentColor(judgmentName: string, scoringSystem: string): string {
  if (scoringSystem?.toLowerCase() === 'itg') {
    return ITG_JUDGMENT_COLORS[judgmentName] || JUDGMENT_COLORS[judgmentName] || '#666666';
  }
  return JUDGMENT_COLORS[judgmentName] || '#666666';
}

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
      return '#2563EB';
    case 'easy':
      return '#16A34A';
    case 'medium':
      return '#CA8A04';
    case 'hard':
      return '#EA580C';
    case 'challenge':
    case 'expert':
      return '#DC2626';
    case 'edit':
      return '#7C3AED';
    default:
      return '#4B5563';
  }
}

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

function getScoringSystemColor(system: string): string {
  switch (system.toUpperCase()) {
    case 'H.EX':
      return '#FF69B4';
    case 'EX':
      return '#21CCE8';
    case 'ITG':
    case 'MONEY':
      return '#FFFFFF';
    default:
      return '#21CCE8';
  }
}

function getScoringSystemLabel(system: string): string {
  switch (system.toUpperCase()) {
    case 'H.EX':
      return 'H.EX';
    case 'EX':
      return 'EX';
    case 'ITG':
    case 'MONEY':
      return 'ITG';
    default:
      return 'EX';
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function getScoringSystem(system: string) {
  const systemUpper = system.toUpperCase();
  return systemUpper === 'H.EX' || systemUpper === 'HARDEX'
    ? HARD_EX_SCORING_SYSTEM
    : systemUpper === 'ITG' || systemUpper === 'MONEY'
      ? MONEY_SCORING_SYSTEM
      : EX_SCORING_SYSTEM;
}

function generatePlayCardHTML(play: SessionPlayData, systemColor: string, scoringSystem: string, playIndex: number): string {
  const scorePercent = parseFloat(play.score.score).toFixed(2);
  const diffColor = getDifficultyColor(play.chart.difficulty);
  const systemLabel = getScoringSystemLabel(scoringSystem);

  // Format delta for display
  const formatDelta = (d: number | null | undefined): { text: string; color: string } | null => {
    if (d === null || d === undefined) return null;
    const formatted = (d >= 0 ? '+' : '') + d.toFixed(2) + '%';
    if (d > 0) return { text: formatted, color: '#36d399' }; // green
    if (d < 0) return { text: formatted, color: '#f87272' }; // red
    return { text: formatted, color: '#9ca3af' }; // gray for tie
  };
  const deltaDisplay = formatDelta(play.score.delta);

  const scoring = getScoringSystem(scoringSystem);
  const timingWindows = scoring.windows;
  const judgmentOrder = timingWindows.map((w) => w.name).concat(['Miss']);

  // Get max digits across all judgments (minimum 4)
  const maxDigits = Math.max(
    4,
    ...judgmentOrder.filter((j: string) => play.score.judgments[j] !== undefined).map((j: string) => String(play.score.judgments[j] || 0).length),
  );

  const disabledWindows = getDisabledWindowsMap(play.modifiers?.disabledWindows);

  // Check if chart was passed (has judgments)
  const hasJudgments = Object.keys(play.score.judgments).length > 0;

  // Generate judgment rows (compact style like JudgmentList)
  const judgmentRowsHTML = hasJudgments
    ? judgmentOrder
        .filter((j: string) => play.score.judgments[j] !== undefined)
        .map((j: string) => {
          const count = play.score.judgments[j] || 0;
          const isDisabled = disabledWindows[j] || false;
          const color = isDisabled ? '#555555' : getJudgmentColor(j, scoringSystem);
          const countStr = String(count);
          const paddingNeeded = maxDigits - countStr.length;
          const leadingZeroColor = isDisabled ? color : `${color}40`;

          return `
          <div class="judgment-row${isDisabled ? ' disabled' : ''}">
            <span class="judgment-label" style="color: ${color};">${j}</span>
            <span class="judgment-count" style="color: ${color};">
              ${paddingNeeded > 0 ? `<span style="color: ${leadingZeroColor};">${'0'.repeat(paddingNeeded)}</span>` : ''}${countStr}
            </span>
          </div>
        `;
        })
        .join('')
    : `<div class="not-passed">Chart not passed</div>`;

  const hasTimingData = play.timingData && play.timingData.length > 0;
  const hasBanner = !!play.chart.bannerUrl;
  const hasDifficultyInfo = play.chart.meter !== null && play.chart.meter !== undefined;
  const gradeToShow = hasJudgments ? play.score.grade : 'F';

  return `
    <div class="play-card">
      <!-- Column 1: Banner + Chart Info -->
      <div class="col-banner${hasBanner ? '' : ' no-banner'}">
        <div class="banner-container">
          ${hasBanner ? `<img src="${play.chart.bannerUrl}" alt="${play.chart.title}" class="play-banner" />` : ''}
          ${
            hasBanner && hasDifficultyInfo
              ? `
          <div class="difficulty-chip" style="background-color: ${diffColor};">
            ${getStepsTypeAbbrev(play.chart.stepsType)}${getDifficultyAbbrev(play.chart.difficulty)} ${play.chart.meter}
          </div>
          `
              : ''
          }
        </div>
        <div class="chart-info">
          ${
            !hasBanner && hasDifficultyInfo
              ? `
          <div class="difficulty-chip" style="background-color: ${diffColor};">
            ${getStepsTypeAbbrev(play.chart.stepsType)}${getDifficultyAbbrev(play.chart.difficulty)} ${play.chart.meter}
          </div>
          `
              : ''
          }
          <div class="chart-title">${play.chart.title || 'Unknown'}</div>
          <div class="chart-artist">${play.chart.artist || 'Unknown Artist'}</div>
        </div>
      </div>
      
      <!-- Column 2: Score/Grade + Scatterplot -->
      <div class="col-score">
        <div class="score-grade">
          <img src="${getGradeImage(gradeToShow || 'F')}" alt="${gradeToShow || 'F'}" class="grade-image" />
          <div class="score-text">
            <div class="score-line">
              <span class="score-value" style="color: ${systemColor};">${scorePercent}%</span>
              ${deltaDisplay ? `<span class="score-delta" style="color: ${deltaDisplay.color};">(${deltaDisplay.text})</span>` : ''}
            </div>
            <span class="score-label" style="color: ${systemColor};">${systemLabel}</span>
          </div>
        </div>
        ${
          hasTimingData
            ? `
        <div class="timing-chart-container">
          <canvas id="timingChart-${playIndex}"></canvas>
        </div>
        `
            : `
        <div class="timing-chart-placeholder">No timing data</div>
        `
        }
      </div>
      
      <!-- Column 3: Judgments -->
      <div class="col-judgments">
        ${judgmentRowsHTML}
      </div>
    </div>
  `;
}

export function generateSessionImageHTML(session: SessionData): string {
  const gradientColors = ['#0f172a', '#1e293b'];
  const systemColor = getScoringSystemColor(session.scoringSystem);
  const scoring = getScoringSystem(session.scoringSystem);
  const timingWindows = scoring.windows;

  // Generate play cards HTML with index for unique chart IDs
  const playCardsHTML = session.selectedPlays.map((play, index) => generatePlayCardHTML(play, systemColor, session.scoringSystem, index)).join('');

  // Generate timing chart data for each play
  const playsTimingData = session.selectedPlays.map((play) => {
    if (!play.timingData || play.timingData.length === 0) {
      return { chartData: [], missTimes: [] };
    }

    const chartData: { x: number; y: number; color: string }[] = [];
    const missTimes: number[] = [];

    for (const [t, off] of play.timingData) {
      if (off === 'Miss') {
        missTimes.push(t);
      } else if (typeof off === 'number') {
        const abs = Math.abs(off);
        const win = timingWindows.find((w) => abs <= w.maxOffset);
        const judgmentName = win ? win.name : 'Miss';
        const color = getJudgmentColor(judgmentName, session.scoringSystem);
        chartData.push({ x: t, y: off * 1000, color }); // Convert to ms
      }
    }

    return { chartData, missTimes };
  });

  const playsTimingDataJSON = JSON.stringify(playsTimingData);

  // Generate difficulty distribution data for chart
  const diffDistJSON = JSON.stringify(session.difficultyDistribution);

  // Generate top packs HTML (2x2 grid of banners)
  const topPacksForGrid = session.topPacks.slice(0, 4);
  const chartHeight = topPacksForGrid.length <= 2 ? 85 : 110;
  const topPacksHTML = topPacksForGrid
    .map(
      (pack) => `
    <div class="pack-grid-item" title="${pack.packName} (${pack.chartCount} chart${pack.chartCount !== 1 ? 's' : ''})">
      ${pack.bannerUrl ? `<img src="${pack.bannerUrl}" alt="${pack.packName}" class="pack-grid-banner" />` : `<div class="pack-grid-placeholder">📁</div>`}
    </div>
  `,
    )
    .join('');

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
      font-family: 'Nunito';
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
      width: 700px;
      background: linear-gradient(135deg, ${gradientColors[0]} 0%, ${gradientColors[1]} 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'Noto Sans JP', sans-serif;
      color: white;
      padding: 20px;
    }
    
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 12px;
      padding: 12px 16px;
    }
    
    .avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.3);
      object-fit: cover;
      background: rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    }
    
    .header-info {
      flex: 1;
      min-width: 0;
    }
    
    .header-top-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    
    .header-info h1 {
      font-size: 18px;
      font-weight: 700;
    }
    
    .session-date {
      font-size: 11px;
      opacity: 0.6;
    }
    
    .header-stats {
      display: flex;
      gap: 12px;
      margin-top: 3px;
    }
    
    .header-stat {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .grade-icon {
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
    
    .header-stat-value {
      font-size: 15px;
      font-weight: 800;
      color: ${systemColor};
      font-family: 'Nunito', sans-serif;
    }
    
    .header-stat-label {
      font-size: 10px;
      opacity: 0.6;
      text-transform: lowercase;
    }
    
    .duration-badge {
      font-size: 18px;
      font-weight: 800;
      color: ${systemColor};
      font-family: 'Nunito', sans-serif;
      flex-shrink: 0;
    }
    
    .info-row {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }
    
    .chart-section {
      flex: 1;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
      padding: 12px;
    }
    
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      opacity: 0.7;
    }
    
    .chart-container {
      height: ${chartHeight}px;
    }
    
    .packs-section {
      flex: 1;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
      padding: 12px;
    }
    
    .packs-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    
    .pack-grid-item {
      border-radius: 4px;
      overflow: hidden;
    }
    
    .pack-grid-banner {
      width: 100%;
      aspect-ratio: 2.56 / 1;
      object-fit: cover;
      display: block;
    }
    
    .pack-grid-placeholder {
      width: 100%;
      aspect-ratio: 2.56 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.05);
      font-size: 14px;
      opacity: 0.3;
    }
    
    .plays-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .play-card {
      display: flex;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
      overflow: hidden;
      height: 150px;
      padding: 10px;
      gap: 10px;
    }
    
    /* Column 1: Banner + Chart Info */
    .col-banner {
      width: 180px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    
    .col-banner.no-banner {
      justify-content: center;
    }
    
    .banner-container {
      position: relative;
    }
    
    .play-banner {
      width: 100%;
      height: 70px;
      object-fit: cover;
      border-radius: 6px;
    }
    
    .banner-container .difficulty-chip {
      position: absolute;
      bottom: 8px;
      left: 4px;
    }
    
    .chart-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .difficulty-chip {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 700;
      color: white;
      align-self: flex-start;
    }
    
    .chart-title {
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .chart-artist {
      font-size: 12px;
      opacity: 0.7;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    /* Column 2: Score/Grade + Scatterplot */
    .col-score {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    
    .score-grade {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    
    .grade-image {
      width: 40px;
      height: 40px;
      object-fit: contain;
      flex-shrink: 0;
    }
    
    .score-text {
      display: flex;
      flex-direction: column;
    }
    
    .score-line {
      display: flex;
      align-items: baseline;
      gap: 4px;
    }
    
    .score-value {
      font-size: 22px;
      font-weight: 800;
      font-family: 'Nunito', sans-serif;
      line-height: 1;
    }
    
    .score-delta {
      font-size: 12px;
      font-weight: 600;
      font-family: 'Nunito', sans-serif;
    }
    
    .score-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.7;
    }
    
    .timing-chart-container {
      flex: 1;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 6px;
      padding: 4px;
      min-height: 55px;
    }
    
    .timing-chart-container canvas {
      width: 100% !important;
      height: 100% !important;
    }
    
    .timing-chart-placeholder {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 6px;
      font-size: 10px;
      opacity: 0.4;
      min-height: 55px;
    }
    
    /* Column 3: Judgments */
    .col-judgments {
      width: 170px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    .judgment-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      line-height: 1.15;
    }
    
    .judgment-row.disabled {
      opacity: 0.5;
    }
    
    .judgment-label {
      font-size: 14px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      font-family: 'Miso', system-ui, sans-serif;
    }
    
    .judgment-count {
      font-size: 16px;
      font-weight: 800;
      font-family: 'Nunito', sans-serif;
      text-align: right;
    }
    
    .not-passed {
      font-size: 12px;
      color: #f87272;
      opacity: 0.7;
      text-align: center;
    }
    
    .footer {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 16px;
    }
    
    .footer-logo {
      height: 20px;
      object-fit: contain;
      opacity: 0.7;
    }
    
    .footer-text {
      font-size: 11px;
      opacity: 0.5;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="header">
    ${
      session.user.profileImageUrl
        ? `<img src="${session.user.profileImageUrl}" alt="${session.user.alias}" class="avatar" />`
        : `<div class="avatar" style="display: flex; align-items: center; justify-content: center; font-size: 18px;">👤</div>`
    }
    <div class="header-info">
      <div class="header-top-row">
        <h1>${session.user.alias}</h1>
        <span class="session-date">${new Date(session.startedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}</span>
      </div>
      <div class="header-stats">
        <div class="header-stat">
          <span class="header-stat-value">${session.stats.playCount}</span>
          <span class="header-stat-label">plays</span>
        </div>
        <div class="header-stat">
          <span class="header-stat-value">${session.stats.distinctCharts}</span>
          <span class="header-stat-label">charts</span>
        </div>
        <div class="header-stat">
          <span class="header-stat-value">${session.stats.stepsHit.toLocaleString()}</span>
          <span class="header-stat-label">steps</span>
        </div>${
          session.stats.quads > 0
            ? `
        <div class="header-stat">
          <img src="${getGradeImage('quad')}" class="grade-icon" />
          <span class="header-stat-value">${session.stats.quads}</span>
        </div>`
            : ''
        }${
          session.stats.quints > 0
            ? `
        <div class="header-stat">
          <img src="${getGradeImage('quint')}" class="grade-icon" />
          <span class="header-stat-value">${session.stats.quints}</span>
        </div>`
            : ''
        }${
          session.stats.hexes > 0
            ? `
        <div class="header-stat">
          <img src="${getGradeImage('hex')}" class="grade-icon" />
          <span class="header-stat-value">${session.stats.hexes}</span>
        </div>`
            : ''
        }
      </div>
    </div>
    <div class="duration-badge">${formatDuration(session.durationMs)}</div>
  </div>
  
  <div class="info-row">
    <div class="chart-section">
      <div class="section-title">Difficulty Distribution</div>
      <div class="chart-container">
        <canvas id="diffChart"></canvas>
      </div>
    </div>
    ${
      session.topPacks.length > 0
        ? `
    <div class="packs-section">
      <div class="section-title">Packs Played</div>
      <div class="packs-grid">
        ${topPacksHTML}
      </div>
    </div>
    `
        : ''
    }
  </div>
  
  <div class="plays-section">
    ${playCardsHTML}
  </div>
  
  <div class="footer">
    <img src="https://assets.arrowcloud.dance/logos/20250725/ac%20logo.png" alt="Arrow Cloud" class="footer-logo" />
    <span class="footer-text">arrowcloud.dance/session/${session.id}</span>
  </div>
  
  <script>
    const diffData = ${diffDistJSON};
    const playsTimingData = ${playsTimingDataJSON};
    
    function getMeterColor(meter) {
      if (meter <= 5) return '#36d399';
      if (meter <= 9) return '#3abff8';
      if (meter <= 12) return '#fbbd23';
      if (meter <= 15) return '#f87272';
      return '#d946ef';
    }
    
    // Render difficulty distribution chart
    const ctx = document.getElementById('diffChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: diffData.map(d => d.meter.toString()),
        datasets: [{
          data: diffData.map(d => d.count),
          backgroundColor: diffData.map(d => getMeterColor(d.meter)),
          borderRadius: 4,
          barPercentage: 0.8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.6)',
              font: { size: 9 }
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: {
              color: 'rgba(255, 255, 255, 0.6)',
              font: { size: 9 },
              stepSize: 1
            }
          }
        }
      }
    });
    
    // Render timing scatterplots for each play
    playsTimingData.forEach((playData, index) => {
      const canvas = document.getElementById('timingChart-' + index);
      if (!canvas || playData.chartData.length === 0) return;
      
      const chartData = playData.chartData;
      const missTimes = playData.missTimes;
      
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
      
      // Ensure minimum Y range
      maxAbsY = Math.max(maxAbsY, 50);
      
      Object.entries(colorGroups).forEach(([color, data]) => {
        datasets.push({
          data: data,
          backgroundColor: color,
          borderColor: color,
          pointRadius: 1,
          pointHoverRadius: 1,
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
      
      new Chart(canvas, {
        type: 'scatter',
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              type: 'linear',
              display: false,
              grid: { display: false },
            },
            y: {
              type: 'linear',
              min: -maxAbsY * 1.2,
              max: maxAbsY * 1.2,
              display: false,
              grid: { 
                color: (ctx) => {
                  if (ctx.tick.value === 0) return 'rgba(255, 255, 255, 0.3)';
                  return 'rgba(255, 255, 255, 0.05)';
                }
              },
            }
          },
          layout: {
            padding: 0
          }
        }
      });
    });
    
    window.__chartsReady = true;
  </script>
</body>
</html>`;
}
