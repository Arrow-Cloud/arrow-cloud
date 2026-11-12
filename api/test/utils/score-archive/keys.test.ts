import { parseScoreKey } from '../../../src/utils/score-archive/keys';

describe('parseScoreKey', () => {
  it('reads the receive-time month out of the filename', () => {
    const ts = Date.UTC(2025, 5, 15, 12, 0, 0);
    expect(parseScoreKey(`scores/abcdef0123456789/42/${ts}.json`, 1234)).toEqual({
      key: `scores/abcdef0123456789/42/${ts}.json`,
      size: 1234,
      timestampMs: ts,
      month: '2025-06',
    });
  });

  it('uses UTC for the month boundary', () => {
    const lastMs2025 = Date.UTC(2026, 0, 1) - 1;
    expect(parseScoreKey(`scores/h/1/${lastMs2025}.json`, 1)?.month).toBe('2025-12');
    expect(parseScoreKey(`scores/h/1/${lastMs2025 + 1}.json`, 1)?.month).toBe('2026-01');
  });

  it('rejects keys outside the score layout', () => {
    expect(parseScoreKey('scores/h/1/notanumber.json', 1)).toBeNull();
    expect(parseScoreKey('scores/h/1/1700000000000.txt', 1)).toBeNull();
    expect(parseScoreKey('scores/h/1700000000000.json', 1)).toBeNull();
    expect(parseScoreKey('other/h/1/1700000000000.json', 1)).toBeNull();
    expect(parseScoreKey('scores/h/1/', 0)).toBeNull();
    expect(parseScoreKey('scores/h/1/99999999999999999999.json', 1)).toBeNull();
  });
});
