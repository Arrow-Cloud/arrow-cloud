import React from 'react';

// Shared judgment colors matching PlayPage and share-service
export const JUDGMENT_COLORS: Record<string, string> = {
  'Fantastic (10ms)': '#21CCE8',
  'Fantastic (15ms)': '#21CCE8',
  'Fantastic (23ms)': '#ffffff',
  Excellent: '#e29c18',
  Great: '#66c955',
  Decent: '#b45cff',
  'Way Off': '#c9855e',
  Miss: '#ff3030',
};

// ITG scoring system uses blue for all Fantastics
const ITG_JUDGMENT_COLORS: Record<string, string> = {
  ...JUDGMENT_COLORS,
  'Fantastic (23ms)': '#21CCE8', // ITG uses blue for all Fantastic windows
};

/**
 * Get the judgment color based on scoring system.
 */
export function getJudgmentColor(judgmentName: string, scoringSystem?: 'HardEX' | 'EX' | 'ITG' | null): string {
  if (scoringSystem === 'ITG') {
    return ITG_JUDGMENT_COLORS[judgmentName] || JUDGMENT_COLORS[judgmentName] || '#666666';
  }
  return JUDGMENT_COLORS[judgmentName] || '#666666';
}

// Default ordering for judgment windows (tightest first)
export const DEFAULT_JUDGMENT_ORDER = ['Fantastic (10ms)', 'Fantastic (15ms)', 'Fantastic (23ms)', 'Excellent', 'Great', 'Decent', 'Way Off', 'Miss'];

/**
 * Get a map of which judgment windows are disabled based on the disabledWindows modifier string.
 *
 * Possible values for disabledWindows:
 * - "Decents + Way Offs" - disables Decent and Way Off
 * - "Decents" - disables only Decent
 * - "Way Offs" - disables only Way Off
 * - "Fantastics + Excellents" - disables all Fantastic windows and Excellent
 */
export function getDisabledWindowsMap(disabledWindows: string | undefined | null): Record<string, boolean> {
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

export interface JudgmentEntry {
  name: string;
  value: number;
}

/**
 * Modifiers object - only disabledWindows is needed for judgment display.
 * Other fields are passthrough to allow compatibility with various API shapes.
 */
export interface Modifiers {
  disabledWindows?: string | null;
  [key: string]: unknown;
}

export interface JudgmentListProps {
  /**
   * Judgments to display. Can be an object (name -> count) or an ordered array.
   */
  judgments: Record<string, number> | JudgmentEntry[];
  /**
   * Optional modifiers containing disabledWindows to gray out certain judgments.
   */
  modifiers?: Modifiers | null;
  /**
   * Visual style variant.
   * - "compact": Session page style with leading zeros, larger text, custom fonts
   * - "default": PlayPage style with colored dots
   */
  variant?: 'compact' | 'default';
  /**
   * The active scoring system. Affects judgment colors (e.g., ITG uses blue for all Fantastics).
   */
  scoringSystem?: 'HardEX' | 'EX' | 'ITG' | null;
  /**
   * Optional class name for the container.
   */
  className?: string;
}

/**
 * Sort judgments by the default timing window order.
 */
function sortJudgments(judgments: Record<string, number> | JudgmentEntry[]): JudgmentEntry[] {
  const entries: JudgmentEntry[] = Array.isArray(judgments) ? judgments : Object.entries(judgments).map(([name, value]) => ({ name, value }));

  return entries.sort((a, b) => {
    const ai = DEFAULT_JUDGMENT_ORDER.indexOf(a.name);
    const bi = DEFAULT_JUDGMENT_ORDER.indexOf(b.name);
    const av = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bv = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    if (av !== bv) return av - bv;
    return a.name.localeCompare(b.name);
  });
}

/**
 * JudgmentList displays a list of judgment counts with appropriate coloring
 * and visual indicators for disabled windows.
 */
export const JudgmentList: React.FC<JudgmentListProps> = ({ judgments, modifiers, variant = 'default', scoringSystem, className = '' }) => {
  const sortedJudgments = sortJudgments(judgments);
  const disabledWindowsMap = getDisabledWindowsMap(modifiers?.disabledWindows);

  if (variant === 'compact') {
    // Session page compact style with leading zeros
    const maxDigits = Math.max(4, ...sortedJudgments.map((j) => String(j.value).length));

    return (
      <div className={`p-3 rounded-md ${className}`} style={{ backgroundColor: 'rgba(20, 20, 30, 0.95)' }}>
        {sortedJudgments.map((j) => {
          const isDisabled = disabledWindowsMap[j.name] ?? false;
          const color = isDisabled ? '#555555' : getJudgmentColor(j.name, scoringSystem);
          const leadingZeroColor = isDisabled ? color : `${color}40`;
          const countStr = String(j.value);
          const paddingNeeded = Math.max(0, maxDigits - countStr.length);

          return (
            <div key={j.name} className={`flex items-center justify-between px-2 leading-tight ${isDisabled ? 'opacity-50' : ''}`}>
              <span className="text-base font-normal uppercase tracking-wide opacity-90" style={{ color, fontFamily: "'Miso', system-ui, sans-serif" }}>
                {j.name}
              </span>
              <span
                className="text-2xl font-extrabold tabular-nums text-right leading-tight"
                style={{ color, fontFamily: "'Nunito', sans-serif", minWidth: '80px' }}
              >
                {paddingNeeded > 0 && <span style={{ color: leadingZeroColor }}>{'0'.repeat(paddingNeeded)}</span>}
                {countStr}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // Default PlayPage style with row layout and colored dots
  return (
    <div className={`rounded-md border border-base-content/10 overflow-hidden ${className}`}>
      {sortedJudgments.map((j) => {
        const isDisabled = disabledWindowsMap[j.name] ?? false;
        const color = isDisabled ? '#555555' : getJudgmentColor(j.name, scoringSystem);
        const isWhite = color.toLowerCase() === '#ffffff';

        return (
          <div
            key={j.name}
            className={`flex items-center justify-between py-2 px-3 border-b border-base-content/10 last:border-b-0 ${isDisabled ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className={`inline-block w-3 h-3 rounded-full ${isWhite ? 'ring-1 ring-base-content/40' : ''}`} style={{ backgroundColor: color }} />
              <span className="text-sm">{j.name}</span>
            </div>
            <span className="text-lg font-bold tabular-nums">{j.value}</span>
          </div>
        );
      })}
    </div>
  );
};

export default JudgmentList;
