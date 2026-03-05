import { BaseLeaderboard } from '../../src/utils/leaderboard';
import { Play } from '../../prisma/generated';
import { PlaySubmission, HARD_EX_SCORING_SYSTEM, HARD_EX_GRADING_SYSTEM } from '../../src/utils/scoring';
import type { PrismaClient } from '../../prisma/generated/client';

// Minimal stub leaderboard subclass to expose isEligible publicly for testing
class TestLeaderboard extends BaseLeaderboard {
  constructor(play: Play, submission: PlaySubmission, scoringSystem = HARD_EX_SCORING_SYSTEM, gradingSystem = HARD_EX_GRADING_SYSTEM, prisma: PrismaClient) {
    super(play, submission, scoringSystem, gradingSystem, prisma);
  }

  getName() {
    return 'Test';
  }
}

function createMockPrisma(noteData = '1111'): PrismaClient {
  return {
    chart: {
      findFirst: jest.fn().mockResolvedValue({ noteData }),
    },
  } as unknown as PrismaClient;
}

function makePlay(overrides: Partial<Play> = {}): Play {
  return {
    id: 1,
    userId: 'user-1',
    chartHash: 'chart-hash',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    rawTimingDataUrl: 's3://bucket/scores/chart-hash/user-1/123.json',
    ...overrides,
  } as unknown as Play;
}

function makeSubmission(overrides: Partial<PlaySubmission> = {}): PlaySubmission {
  return {
    songName: 'Song',
    artist: 'Artist',
    pack: 'Pack',
    length: '1:00',
    hash: 'chart-hash',
    timingData: [
      // time, offset, arrowType, isStream, foot, early, earlyOffset, heldMiss
      [0.5, 0.001, 1, false, true, false, 0, false],
    ],
    radar: { Holds: [0, 0], Mines: [0, 0], Rolls: [0, 0] },
    difficulty: 1,
    stepartist: 'step',
    lifebarInfo: [
      { x: 0, y: 1 },
      { x: 0.5, y: 0.95 },
    ],
    npsInfo: {
      peakNPS: 1,
      points: [
        { x: 0, y: 0.2 },
        { x: 0.5, y: 0.4 },
      ],
    },
    modifiers: {},
    musicRate: 1,
    usedAutoplay: false,
    passed: true,
    _arrowCloudBodyVersion: '1.2',
    ...overrides,
  } as PlaySubmission;
}

describe('Leaderboard eligibility - musicRate & usedAutoplay', () => {
  const scoring = HARD_EX_SCORING_SYSTEM;
  const grading = HARD_EX_GRADING_SYSTEM;

  test('eligible when musicRate === 1', () => {
    const play = makePlay();
    const submission = makeSubmission({ musicRate: 1 });
    const lb = new TestLeaderboard(play, submission, scoring, grading, createMockPrisma());
    expect(lb.isEligible()).toBe(true);
  });

  test('ineligible when musicRate > 1', () => {
    const play = makePlay();
    const submission = makeSubmission({ musicRate: 1.1 });
    const lb = new TestLeaderboard(play, submission, scoring, grading, createMockPrisma());
    expect(lb.isEligible()).toBe(false);
  });

  test('ineligible when musicRate < 1', () => {
    const play = makePlay();
    const submission = makeSubmission({ musicRate: 0.9 });
    const lb = new TestLeaderboard(play, submission, scoring, grading, createMockPrisma());
    expect(lb.isEligible()).toBe(false);
  });

  test('ineligible when musicRate missing (undefined)', () => {
    const play = makePlay();
    const submission = makeSubmission({ musicRate: undefined });
    const lb = new TestLeaderboard(play, submission, scoring, grading, createMockPrisma());
    expect(lb.isEligible()).toBe(false);
  });

  test('ineligible when usedAutoplay is true', () => {
    const play = makePlay();
    const submission = makeSubmission({ musicRate: 1, usedAutoplay: true });
    const lb = new TestLeaderboard(play, submission, scoring, grading, createMockPrisma());
    expect(lb.isEligible()).toBe(false);
  });

  test('eligible when usedAutoplay false and musicRate 1', () => {
    const play = makePlay();
    const submission = makeSubmission({ musicRate: 1, usedAutoplay: false });
    const lb = new TestLeaderboard(play, submission, scoring, grading, createMockPrisma());
    expect(lb.isEligible()).toBe(true);
  });

  test('ineligible when not passed', () => {
    const play = makePlay();
    const submission = makeSubmission({ musicRate: 1, usedAutoplay: false, passed: false });
    const lb = new TestLeaderboard(play, submission, scoring, grading, createMockPrisma());
    expect(lb.isEligible()).toBe(false);
  });

  test('ineligible when DeadSync with body version < 1.4', () => {
    const play = makePlay();
    const submission = makeSubmission({ _engineName: 'DeadSync', _arrowCloudBodyVersion: '1.3' });
    const lb = new TestLeaderboard(play, submission, scoring, grading, createMockPrisma());
    expect(lb.isEligible()).toBe(false);
  });

  test('eligible when DeadSync with body version >= 1.4', () => {
    const play = makePlay();
    const submission = makeSubmission({ _engineName: 'DeadSync', _arrowCloudBodyVersion: '1.4' });
    const lb = new TestLeaderboard(play, submission, scoring, grading, createMockPrisma());
    expect(lb.isEligible()).toBe(true);
  });

  test('eligible when ITGMania with body version 1.2', () => {
    const play = makePlay();
    const submission = makeSubmission({ _engineName: 'ITGMania', _arrowCloudBodyVersion: '1.2' });
    const lb = new TestLeaderboard(play, submission, scoring, grading, createMockPrisma());
    expect(lb.isEligible()).toBe(true);
  });
});
