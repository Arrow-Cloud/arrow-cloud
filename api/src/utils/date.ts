/**
 * Parse a naive (no timezone) local datetime string and convert it to a UTC Date
 * using the given IANA timezone. Falls back to UTC if the timezone is missing or invalid.
 *
 * @param localDateStr - A datetime string without timezone info, e.g. "2026-02-25T10:24:35"
 * @param timezone - An IANA timezone string, e.g. "America/New_York". Null/undefined means UTC.
 * @returns A Date object representing the equivalent UTC instant
 */
export function parseLocalDateToUTC(localDateStr: string, timezone?: string | null): Date {
  // Append 'Z' so the Date constructor treats it as UTC — this gives us the
  // numeric components we need without any system-local bias.
  const naiveAsUTC = new Date(localDateStr.endsWith('Z') ? localDateStr : localDateStr + 'Z');

  if (isNaN(naiveAsUTC.getTime())) {
    throw new Error(`Invalid date string: ${localDateStr}`);
  }

  if (!timezone) {
    // No timezone on user profile — assume the string is already UTC
    return naiveAsUTC;
  }

  try {
    // Use Intl to figure out the UTC offset of the target timezone at this instant.
    // We format the same instant *in the user's timezone* and compare.
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(naiveAsUTC);
    const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '0';

    // Build what Intl says the wall-clock time is in that timezone when it's
    // naiveAsUTC in UTC.  The difference tells us the timezone's UTC offset.
    const wallInTZ = new Date(
      Date.UTC(
        parseInt(get('year'), 10),
        parseInt(get('month'), 10) - 1,
        parseInt(get('day'), 10),
        parseInt(get('hour'), 10),
        parseInt(get('minute'), 10),
        parseInt(get('second'), 10),
      ),
    );

    // offsetMs = how far ahead the timezone is from UTC  (positive = east)
    const offsetMs = wallInTZ.getTime() - naiveAsUTC.getTime();

    // The user's local clock reads `localDateStr`. To get UTC we subtract the offset.
    return new Date(naiveAsUTC.getTime() - offsetMs);
  } catch {
    // Invalid timezone — treat string as UTC
    console.warn(`Invalid timezone "${timezone}", treating pendingDate as UTC`);
    return naiveAsUTC;
  }
}
