import { readFileSync } from 'fs';
import { Simfile } from '../../../src/utils/simfile/calc-hash';

describe('chart hash calculation', () => {
  test.each([
    ['powermove.ssc', 'dance-single', 'challenge', '40c0a18d3eb40bc2'],
    ['RAID.ssc', 'dance-single', 'challenge', '9b3b1ee2fc57d0cb'],
    ['gimme.sm', 'dance-single', 'challenge', 'aa27dec0f0736540'],
  ])('computes the correct hash for %s', async (fileName, stepsType, difficulty, expectedHash) => {
    const sscFile = readFileSync(__dirname + '/fixtures/' + fileName);
    const simfile = new Simfile(sscFile.toString());
    const chart = simfile.charts.find((chart) => chart.metadata.stepsType === stepsType && chart.metadata.difficulty === difficulty);
    if (chart) {
      expect(chart.calculateHash()).toBe(expectedHash);
    }
  });

  // this test left in because it is easier to debug a single test than a parmetrized one
  test.skip('sm with negative bpms test', () => {
    const file = readFileSync(__dirname + '/fixtures/gimme.sm');
    const stepsType = 'dance-single';
    const difficulty = 'challenge';
    const expectedHash = 'aa27dec0f0736540';

    const simfile = new Simfile(file.toString());
    const chart = simfile.charts.find((chart) => chart.metadata.stepsType === stepsType && chart.metadata.difficulty === difficulty);
    if (chart) {
      expect(chart.calculateHash()).toBe(expectedHash);
    }
  });

  test('parses simfile metadata correctly', () => {
    const sscFile = readFileSync(__dirname + '/fixtures/powermove.ssc');
    const simfile = new Simfile(sscFile.toString());

    expect(simfile.metadata.title).toBe('Powermove');
    expect(simfile.metadata.artist).toBe('Synthtonix');
    expect(simfile.metadata.bpms).toBe('0.000=126.000');
    expect(simfile.charts.length).toBeGreaterThan(0);
  });

  test('parses chart metadata correctly', () => {
    const sscFile = readFileSync(__dirname + '/fixtures/powermove.ssc');
    const simfile = new Simfile(sscFile.toString());

    // Check that we have multiple charts
    expect(simfile.charts.length).toBeGreaterThan(1);

    // Check first chart (Beginner)
    const beginnerChart = simfile.charts.find((chart) => chart.metadata.difficulty === 'beginner');

    expect(beginnerChart).toBeDefined();
    expect(beginnerChart?.metadata.stepsType).toBe('dance-single');
    expect(beginnerChart?.metadata.meter).toBe(2);
    expect(beginnerChart?.metadata.chartName).toBe('...move');
    expect(beginnerChart?.metadata.credit).toBe('omgukk');
  });
});
