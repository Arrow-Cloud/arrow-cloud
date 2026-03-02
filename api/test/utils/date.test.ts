import { parseLocalDateToUTC } from '../../src/utils/date';

describe('parseLocalDateToUTC', () => {
  it('should convert local time to UTC using America/New_York in winter (EST = UTC-5)', () => {
    const result = parseLocalDateToUTC('2026-02-25T10:24:35', 'America/New_York');
    expect(result.toISOString()).toBe('2026-02-25T15:24:35.000Z');
  });

  it('should convert local time to UTC using America/New_York in summer (EDT = UTC-4)', () => {
    const result = parseLocalDateToUTC('2026-07-15T10:24:35', 'America/New_York');
    expect(result.toISOString()).toBe('2026-07-15T14:24:35.000Z');
  });

  it('should convert local time to UTC using Asia/Tokyo (UTC+9, no DST)', () => {
    const result = parseLocalDateToUTC('2026-02-25T10:24:35', 'Asia/Tokyo');
    expect(result.toISOString()).toBe('2026-02-25T01:24:35.000Z');
  });

  it('should convert local time to UTC using Europe/London in winter (GMT = UTC+0)', () => {
    const result = parseLocalDateToUTC('2026-01-15T12:00:00', 'Europe/London');
    expect(result.toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });

  it('should convert local time to UTC using Europe/London in summer (BST = UTC+1)', () => {
    const result = parseLocalDateToUTC('2026-07-15T12:00:00', 'Europe/London');
    expect(result.toISOString()).toBe('2026-07-15T11:00:00.000Z');
  });

  it('should treat date as UTC when timezone is null', () => {
    const result = parseLocalDateToUTC('2026-02-25T10:24:35', null);
    expect(result.toISOString()).toBe('2026-02-25T10:24:35.000Z');
  });

  it('should treat date as UTC when timezone is undefined', () => {
    const result = parseLocalDateToUTC('2026-02-25T10:24:35', undefined);
    expect(result.toISOString()).toBe('2026-02-25T10:24:35.000Z');
  });

  it('should fall back to UTC for an invalid timezone', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const result = parseLocalDateToUTC('2026-02-25T10:24:35', 'Fake/Zone');
    expect(result.toISOString()).toBe('2026-02-25T10:24:35.000Z');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Fake/Zone'));
    warnSpy.mockRestore();
  });

  it('should throw for an invalid date string', () => {
    expect(() => parseLocalDateToUTC('not-a-date', 'America/New_York')).toThrow('Invalid date string');
  });

  it('should handle a date string that already has a Z suffix gracefully', () => {
    // If the string has Z, it's already UTC — no double-append
    const result = parseLocalDateToUTC('2026-02-25T10:24:35Z', null);
    expect(result.toISOString()).toBe('2026-02-25T10:24:35.000Z');
  });
});
