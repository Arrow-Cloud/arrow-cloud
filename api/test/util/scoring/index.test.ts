import {
  HARD_EX_SCORING_SYSTEM,
  EX_SCORING_SYSTEM,
  MONEY_SCORING_SYSTEM,
  SubmissionCalculator,
  EX_GRADING_SYSTEM,
  validatePlaySubmission,
  HARD_EX_GRADING_SYSTEM,
} from '../../../src/utils/scoring';
import { Simfile } from '../../../src/utils/simfile/calc-hash';
import { readFileSync } from 'fs';
import type { PrismaClient } from '../../../prisma/generated/client';

/* eslint-disable @typescript-eslint/no-require-imports */
const basicScore = require('./fixtures/basic-score.json');
const badScore = require('./fixtures/really-bad-score.json');
const moreInterestingScore = require('./fixtures/more-interesting-score.json');
const fullScore = require('./fixtures/full-score.json');
const borderlineGreatScore = require('./fixtures/borderline-great-score.json');
const quintScore = require('./fixtures/quint-score.json');
const destroyFail = require('./fixtures/destroy-fail.json');
const destroyPass = require('./fixtures/destroy-pass.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const destroySimfileContent = readFileSync(__dirname + '/../simfile/fixtures/destroy.ssc', 'utf-8');
const destroySimfile = new Simfile(destroySimfileContent.toString());
const destroyChartNoteData = destroySimfile.charts[4].noteData;

interface PrismaMock {
  prisma: PrismaClient;
  findFirst: jest.Mock;
}

function createCalculator(submission: unknown, noteData: string = destroyChartNoteData): PrismaMock & { calculator: SubmissionCalculator } {
  const findFirst = jest.fn().mockResolvedValue({ noteData });
  const prisma = {
    chart: {
      findFirst,
    },
  } as unknown as PrismaClient;

  const calculator = new SubmissionCalculator(submission as any, prisma);

  return { calculator, prisma, findFirst };
}

describe('scoring', () => {
  test.each([
    ['basic hard ex', basicScore, HARD_EX_SCORING_SYSTEM, 78.12],
    ['basic ex', basicScore, EX_SCORING_SYSTEM, 87.5],
    ['basic money', basicScore, MONEY_SCORING_SYSTEM, 96.66],
    ['really bad score hard ex', badScore, HARD_EX_SCORING_SYSTEM, 3.33],
    ['really bad score ex', badScore, EX_SCORING_SYSTEM, 10.0],
    ['really bad score money', badScore, MONEY_SCORING_SYSTEM, 0],
    ['more interesting score hard ex', moreInterestingScore, HARD_EX_SCORING_SYSTEM, 60.28],
    ['more interesting score ex', moreInterestingScore, EX_SCORING_SYSTEM, 73.75],
    ['more interesting score money', moreInterestingScore, MONEY_SCORING_SYSTEM, 67.82],
    ['full score hard ex', fullScore, HARD_EX_SCORING_SYSTEM, 67.49],
    ['full score ex', fullScore, EX_SCORING_SYSTEM, 78.99],
    ['full score money', fullScore, MONEY_SCORING_SYSTEM, 86.8],
    ['borderline great score ex', borderlineGreatScore, EX_SCORING_SYSTEM, 99.02],
    // ['failing score money', destroyFail, MONEY_SCORING_SYSTEM, 49.99],
    ['destroy pass', destroyPass, EX_SCORING_SYSTEM, 98.8],
  ])('computes the correct score - %s', async (testName, scoreData, timingSystem, expectedResult) => {
    const { calculator } = createCalculator(scoreData);
    const result = await calculator.calculateScore(timingSystem);
    expect(result.score).toBe(expectedResult);
  });

  test('destroy pass', async () => {
    const { calculator } = createCalculator(destroyPass);
    const result = await calculator.calculateScore(EX_SCORING_SYSTEM);
    expect(result.score).toBe(98.8);
  });

  test('destroy fail', async () => {
    const { calculator, findFirst } = createCalculator(destroyFail, destroyChartNoteData);
    const result = await calculator.calculateScore(EX_SCORING_SYSTEM);
    expect(findFirst).toHaveBeenCalledWith({
      where: { hash: destroyFail.hash },
      select: { noteData: true },
    });
    expect(result.score).toBe(23.56);
  });
});

describe('grading', () => {
  // todo: better tests, I've spot checked these but we need more cases
  test.each([
    ['full score grade', fullScore, EX_GRADING_SYSTEM, 'A+'],
    ['borderline great score grade', borderlineGreatScore, EX_GRADING_SYSTEM, 'Tristar'],
    ['basic score grade', basicScore, EX_GRADING_SYSTEM, 'Star'],
    ['really bad score grade', badScore, EX_GRADING_SYSTEM, 'D'],
    ['more interesting score grade', moreInterestingScore, EX_GRADING_SYSTEM, 'C+'],
    ['quint score grade', quintScore, EX_GRADING_SYSTEM, 'Quint'],
  ])('calculates the correct grade - %s', async (testName, scoreData, gradingSystem, expectedResult) => {
    const { calculator } = createCalculator(scoreData);
    const result = await calculator.calculateGrade(gradingSystem);
    expect(result).toBe(expectedResult);
  });

  test('destroy fail grade', async () => {
    const { calculator } = createCalculator(destroyFail, destroyChartNoteData);
    const result = await calculator.calculateGrade(EX_GRADING_SYSTEM);
    expect(result).toBe('F');
  });

  test('quints dont count as hexes', async () => {
    const { calculator } = createCalculator(quintScore);
    const result = await calculator.calculateGrade(HARD_EX_GRADING_SYSTEM);
    expect(result).toBe('Quint');
  });
});

describe('getJudgments', () => {
  test('returns the correct judgment counts', () => {
    const { calculator } = createCalculator(borderlineGreatScore);
    const judgments = calculator.getJudgments(EX_SCORING_SYSTEM);

    expect(judgments).toEqual({
      'Fantastic (15ms)': 740,
      'Fantastic (23ms)': 27,
      Excellent: 6,
      Great: 2,
      Decent: 0,
      'Way Off': 0,
      Miss: 0,
    });
  });
});

describe('validation: timing datum minimal length', () => {
  test('accepts timingData entries with only [time, offset]', async () => {
    const minimalSubmission = {
      songName: 'Test Song',
      artist: 'Test Artist',
      pack: 'Test Pack',
      length: '2:00',
      hash: 'TESTHASH',
      timingData: [
        [0.5, 0.003],
        [1.0, 'Miss'],
        [1.5, -0.02],
      ],
      radar: { Holds: [0, 0], Mines: [0, 0], Rolls: [0, 0] },
      difficulty: 'Hard',
      stepartist: 'Tester',
      lifebarInfo: [{ x: 0, y: 0.5 }],
      npsInfo: { peakNPS: 1, points: [{ x: 0, y: 0.5 }] },
      modifiers: {
        visualDelay: 0,
        acceleration: [],
        appearance: [],
        effect: [],
        mini: 0,
        turn: 'None',
        disabledWindows: '',
        speed: { value: 1, type: 'x' },
        perspective: 'Overhead',
        noteskin: 'Default',
      },
      musicRate: 1,
      usedAutoplay: false,
      passed: true,
      _arrowCloudBodyVersion: '1.0',
    };

    const parsed = validatePlaySubmission(minimalSubmission);
    expect(parsed.timingData.length).toBe(3);

    const { calculator } = createCalculator(parsed);
    const scoreEX = await calculator.calculateScore(EX_SCORING_SYSTEM);
    expect(typeof scoreEX.score).toBe('number');
  });
});
