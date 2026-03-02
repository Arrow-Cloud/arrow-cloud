import { readFileSync } from 'fs';
import { Simfile } from '../../../src/utils/simfile/calc-hash';
import { parseNotes, countNotes } from '../../../src/utils/simfile/chart-parser';

describe('chart hash calculation', () => {
  test('parses chart metadata correctly', () => {
    const sscFile = readFileSync(__dirname + '/fixtures/lifts.ssc');
    const simfile = new Simfile(sscFile.toString());

    // Check that we have multiple charts
    expect(simfile.charts.length).toBe(1);

    const notes = parseNotes(simfile.charts[0].noteData);
    expect(notes.length).toBeGreaterThan(0);

    const counts = countNotes(notes);
    expect(counts).toEqual({
      taps: 64,
      holds: 36,
      rolls: 32,
      mines: 16,
      lifts: 32,
      totalNotes: 164,
    });
  });

  test('parses chart metadata correctly for destroy', () => {
    const sscFile = readFileSync(__dirname + '/fixtures/destroy.ssc');
    const simfile = new Simfile(sscFile.toString());

    // Check that we have multiple charts
    expect(simfile.charts.length).toBe(6);

    const notes = parseNotes(simfile.charts[4].noteData);
    expect(notes.length).toBeGreaterThan(0);

    const counts = countNotes(notes);
    expect(counts).toEqual({
      taps: 928,
      holds: 106,
      rolls: 1,
      mines: 137,
      lifts: 0,
      totalNotes: 1035,
    });
  });
});
