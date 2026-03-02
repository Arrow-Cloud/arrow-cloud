import { IntlShape } from 'react-intl';

/**
 * Formats a date as a human-readable relative time string.
 * Automatically picks the most appropriate unit (seconds, minutes, hours, days, weeks, months, years).
 */
export function formatRelativeTimeAuto(date: Date | string, intl: IntlShape): string {
  const now = Date.now();
  const timestamp = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diffMs = timestamp - now;
  const absDiffMs = Math.abs(diffMs);

  // Define thresholds in milliseconds
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;

  if (absDiffMs < MINUTE) {
    // Less than a minute - show seconds
    value = Math.round(diffMs / 1000);
    unit = 'second';
  } else if (absDiffMs < HOUR) {
    // Less than an hour - show minutes
    value = Math.round(diffMs / MINUTE);
    unit = 'minute';
  } else if (absDiffMs < DAY) {
    // Less than a day - show hours
    value = Math.round(diffMs / HOUR);
    unit = 'hour';
  } else if (absDiffMs < WEEK) {
    // Less than a week - show days
    value = Math.round(diffMs / DAY);
    unit = 'day';
  } else if (absDiffMs < MONTH) {
    // Less than a month - show weeks
    value = Math.round(diffMs / WEEK);
    unit = 'week';
  } else if (absDiffMs < YEAR) {
    // Less than a year - show months
    value = Math.round(diffMs / MONTH);
    unit = 'month';
  } else {
    // Show years
    value = Math.round(diffMs / YEAR);
    unit = 'year';
  }

  return intl.formatRelativeTime(value, unit);
}
