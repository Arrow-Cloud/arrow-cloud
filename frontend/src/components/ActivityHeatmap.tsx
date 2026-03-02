import React, { useMemo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FormattedMessage, useIntl } from 'react-intl';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

const HeatmapTooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <>
      <div ref={triggerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        {children}
      </div>
      {isVisible &&
        createPortal(
          <div
            className="fixed z-[9999] px-2 py-1 text-xs font-medium text-base-content bg-base-200 rounded shadow-lg border border-base-300 whitespace-nowrap pointer-events-none"
            style={{
              left: position.x,
              top: position.y,
              transform: 'translate(-50%, -100%) translateY(-6px)',
            }}
          >
            {content}
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-base-200" />
          </div>,
          document.body,
        )}
    </>
  );
};

interface ActivityHeatmapProps {
  heatMap: Record<string, number>;
  months?: number; // Number of months to show (default 12)
}

// Project genesis date - earliest possible date to show
const PROJECT_START_DATE = new Date('2025-10-01');

/**
 * Format a date as YYYY-MM-DD in local timezone (no UTC conversion)
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string as a local date (not UTC)
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * GitHub-style activity heatmap showing plays per day
 */
export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ heatMap, months = 12 }) => {
  const { formatDate, formatNumber } = useIntl();

  const { weeks, maxCount } = useMemo(() => {
    const today = new Date();
    // Add one day to accommodate users in timezones ahead of the viewer
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    let startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - months);

    // Ensure we don't go before project start date
    if (startDate < PROJECT_START_DATE) {
      startDate = new Date(PROJECT_START_DATE);
    }

    // Align to start of week (Sunday)
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const weeks: Array<Array<{ date: string; count: number; isInRange: boolean }>> = [];
    const monthLabels: Array<{ month: string; weekIndex: number }> = [];
    let currentWeek: Array<{ date: string; count: number; isInRange: boolean }> = [];
    let maxCount = 0;
    let lastMonth = -1;

    const current = new Date(startDate);
    let weekIndex = 0;

    while (current <= endDate) {
      const dateStr = formatLocalDate(current);
      const count = heatMap[dateStr] || 0;
      const isInRange = current >= startDate && current <= endDate;

      if (count > maxCount) maxCount = count;

      // Track month changes for labels
      if (current.getMonth() !== lastMonth && isInRange) {
        monthLabels.push({
          month: formatDate(current, { month: 'short' }),
          weekIndex,
        });
        lastMonth = current.getMonth();
      }

      currentWeek.push({ date: dateStr, count, isInRange });

      if (current.getDay() === 6) {
        // Saturday - end of week
        weeks.push(currentWeek);
        currentWeek = [];
        weekIndex++;
      }

      current.setDate(current.getDate() + 1);
    }

    // Push remaining days
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return { weeks, maxCount, monthLabels };
  }, [heatMap, months, formatDate]);

  const getColorClass = (count: number): string => {
    if (count === 0) return 'bg-base-300';
    if (maxCount === 0) return 'bg-base-300';

    const intensity = count / maxCount;
    if (intensity <= 0.25) return 'bg-primary/30';
    if (intensity <= 0.5) return 'bg-primary/50';
    if (intensity <= 0.75) return 'bg-primary/70';
    return 'bg-primary';
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to the right (most recent) on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [weeks]);

  return (
    <div className="space-y-3 overflow-hidden">
      {/* Heatmap grid with scrollable container */}
      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex-shrink-0 flex flex-col gap-1 text-xs text-base-content/60 pr-1">
          <div className="h-3"></div>
          <div className="h-3 leading-3">
            <FormattedMessage defaultMessage="Mon" id="40N/ij" description="Label for Monday in the activity heatmap" />
          </div>
          <div className="h-3"></div>
          <div className="h-3 leading-3">
            <FormattedMessage defaultMessage="Wed" id="Yz+BKn" description="Label for Wednesday in the activity heatmap" />
          </div>
          <div className="h-3"></div>
          <div className="h-3 leading-3">
            <FormattedMessage defaultMessage="Fri" id="mSiBrQ" description="Label for Friday in the activity heatmap" />
          </div>
          <div className="h-3"></div>
        </div>

        {/* Scrollable heatmap grid */}
        <div ref={scrollContainerRef} className="flex gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-base-300">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-1">
              {week.map((day) => (
                <HeatmapTooltip
                  key={day.date}
                  content={`${formatDate(parseLocalDate(day.date), { dateStyle: 'medium' })}: ${formatNumber(day.count)} ${day.count === 1 ? 'play' : 'plays'}`}
                >
                  <div
                    className={`w-3 h-3 rounded-sm ${day.isInRange ? getColorClass(day.count) : 'bg-transparent'} transition-colors hover:ring-1 hover:ring-base-content/30`}
                  />
                </HeatmapTooltip>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-end text-xs text-base-content/60">
        <div className="flex items-center gap-1">
          <span>
            <FormattedMessage defaultMessage="Less" id="zBg9VK" description="Label for the lesser end of the activity heatmap legend" />
          </span>
          <div className="w-3 h-3 rounded-sm bg-base-300" />
          <div className="w-3 h-3 rounded-sm bg-primary/30" />
          <div className="w-3 h-3 rounded-sm bg-primary/50" />
          <div className="w-3 h-3 rounded-sm bg-primary/70" />
          <div className="w-3 h-3 rounded-sm bg-primary" />
          <span>
            <FormattedMessage defaultMessage="More" id="xjRuiz" description="Label for the greater end of the activity heatmap legend" />
          </span>
        </div>
      </div>
    </div>
  );
};
