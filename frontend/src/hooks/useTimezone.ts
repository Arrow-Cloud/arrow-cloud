import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Type assertion helper for Intl.supportedValuesOf (available in modern browsers but not in older TS types)
const getIntlSupportedValuesOf = (): ((key: string) => string[]) | undefined => {
  return (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
};

/**
 * Hook that automatically detects the user's timezone and sets it in their profile
 * if they don't have one configured yet.
 *
 * This should be used once in the app (e.g., in App.tsx or a layout component)
 * after the user is authenticated.
 */
export function useAutoDetectTimezone(): void {
  const { user, updateProfile } = useAuth();
  const hasAttempted = useRef(false);

  useEffect(() => {
    // Only run once per session, and only if user is logged in
    if (!user || hasAttempted.current) {
      return;
    }

    // If user already has a timezone set, don't override it
    if (user.timezone) {
      return;
    }

    // Mark as attempted to prevent duplicate calls
    hasAttempted.current = true;

    // Detect the browser's timezone
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (!detectedTimezone) {
      console.warn('Could not detect browser timezone');
      return;
    }

    // Update the user's profile with the detected timezone
    updateProfile({ timezone: detectedTimezone })
      .then(() => {
        console.log(`Auto-detected and set timezone to: ${detectedTimezone}`);
      })
      .catch((error) => {
        console.error('Failed to auto-set timezone:', error);
        // Reset the flag so we can try again on next render
        hasAttempted.current = false;
      });
  }, [user, updateProfile]);
}

/**
 * Get the user's timezone, falling back to browser timezone if not set.
 */
export function getUserTimezone(user: { timezone?: string | null } | null): string {
  if (user?.timezone) {
    return user.timezone;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Extract the region (first part) from an IANA timezone identifier.
 * e.g., "America/New_York" -> "America"
 */
function getTimezoneRegion(tz: string): string {
  const parts = tz.split('/');
  return parts[0];
}

/**
 * Format a timezone identifier into a human-readable label.
 * e.g., "America/New_York" -> "New York"
 * e.g., "America/Argentina/Buenos_Aires" -> "Argentina / Buenos Aires"
 */
function formatTimezoneLabel(tz: string): string {
  const parts = tz.split('/');
  // Remove the region (first part) and format the rest
  const locationParts = parts.slice(1);
  return locationParts.map((part) => part.replace(/_/g, ' ')).join(' / ');
}

/**
 * Get the UTC offset in minutes for a timezone.
 * Returns the offset as minutes from UTC (negative = behind UTC, positive = ahead of UTC).
 */
function getTimezoneOffsetMinutes(tz: string): number {
  try {
    const now = new Date();
    // Get the timezone's formatted offset
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');

    if (!offsetPart) return 0;

    const offsetStr = offsetPart.value; // e.g., "GMT-5", "GMT+5:30", "GMT"

    if (offsetStr === 'GMT' || offsetStr === 'UTC') return 0;

    const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 0;

    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = match[3] ? parseInt(match[3], 10) : 0;

    return sign * (hours * 60 + minutes);
  } catch {
    return 0;
  }
}

/**
 * Format UTC offset in minutes to a human-readable string.
 * e.g., -300 -> "UTC-05:00", 330 -> "UTC+05:30"
 */
function formatUtcOffset(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'UTC±00:00';

  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;

  return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Fallback list of common timezones for browsers that don't support Intl.supportedValuesOf
 */
function getFallbackTimezones(): string[] {
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Moscow',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Singapore',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Australia/Sydney',
    'Australia/Perth',
    'Pacific/Auckland',
  ];
}

/**
 * Get the complete list of timezone options for a settings dropdown.
 * Uses the browser's Intl API to get all supported IANA timezone identifiers.
 * Returns timezones sorted by UTC offset, with offset shown in labels.
 */
export function getTimezoneOptions(): Array<{ value: string; label: string; group: string; offsetMinutes: number }> {
  // Get all supported timezones from the browser
  // Intl.supportedValuesOf is available in modern browsers (Chrome 93+, Firefox 93+, Safari 15.4+)
  let timezones: string[];
  const supportedValuesOf = getIntlSupportedValuesOf();

  if (supportedValuesOf) {
    try {
      timezones = supportedValuesOf('timeZone');
    } catch {
      timezones = getFallbackTimezones();
    }
  } else {
    // Fallback for older browsers - use a minimal set
    timezones = getFallbackTimezones();
  }

  const options = timezones.map((tz) => {
    const offsetMinutes = getTimezoneOffsetMinutes(tz);
    const offsetStr = formatUtcOffset(offsetMinutes);
    const locationLabel = formatTimezoneLabel(tz) || tz;

    return {
      value: tz,
      label: `(${offsetStr}) ${locationLabel}`,
      group: getTimezoneRegion(tz),
      offsetMinutes,
    };
  });

  // Sort by UTC offset (most negative first), then alphabetically by label
  options.sort((a, b) => {
    if (a.offsetMinutes !== b.offsetMinutes) {
      return a.offsetMinutes - b.offsetMinutes;
    }
    return a.label.localeCompare(b.label);
  });

  return options;
}
