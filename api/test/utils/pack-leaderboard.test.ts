import type { PrismaClient } from '../../prisma/generated/client';
import {
  THC4_PACK_ID,
  PACK_LEADERBOARD_DIFFICULTIES,
  getPackLeaderboardDifficulties,
  getEligiblePacksForChart,
  calculatePackLeaderboards,
} from '../../src/utils/pack-leaderboard';

// A full-difficulty eligible pack, for contrast with THC4's Hard/Expert-only override.
const FULL_PACK_ID = 371;

function simfileChart(packId: number, difficulty: string) {
  return {
    chartHash: `hash-${packId}-${difficulty}`,
    difficulty,
    meter: 10,
    cmodIneligible: false,
    simfile: { packId, title: 'Song', artist: 'Artist', pack: { name: `Pack ${packId}` } },
  };
}

describe('getPackLeaderboardDifficulties', () => {
  it('returns every difficulty slot for a pack without an override', () => {
    expect(getPackLeaderboardDifficulties(FULL_PACK_ID)).toEqual(PACK_LEADERBOARD_DIFFICULTIES);
  });

  it('returns only hard/challenge for THC4', () => {
    expect(getPackLeaderboardDifficulties(THC4_PACK_ID)).toEqual(['hard', 'challenge']);
  });
});

describe('getEligiblePacksForChart', () => {
  it('drops matches in difficulty slots the pack does not run leaderboards for', async () => {
    const prisma = {
      simfileChart: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            simfileChart(THC4_PACK_ID, 'medium'),
            simfileChart(THC4_PACK_ID, 'hard'),
            simfileChart(THC4_PACK_ID, 'challenge'),
            simfileChart(FULL_PACK_ID, 'medium'),
          ]),
      },
    } as unknown as PrismaClient;

    const matches = await getEligiblePacksForChart(prisma, 'any-hash');

    expect(matches.map((m) => [m.packId, m.difficulty])).toEqual([
      [THC4_PACK_ID, 'hard'],
      [THC4_PACK_ID, 'challenge'],
      [FULL_PACK_ID, 'medium'],
    ]);
  });
});

describe('calculatePackLeaderboards', () => {
  function mockPrisma(packId: number) {
    return {
      pack: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: packId, name: `Pack ${packId}` }) },
      simfileChart: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaClient & { simfileChart: { findMany: jest.Mock } };
  }

  it('emits every difficulty slot for a pack without an override', async () => {
    const prisma = mockPrisma(FULL_PACK_ID);
    const result = await calculatePackLeaderboards(prisma, FULL_PACK_ID);
    expect(Object.keys(result.leaderboards)).toEqual(['medium', 'hard', 'challenge']);
  });

  it('only queries for and emits hard/challenge for THC4', async () => {
    const prisma = mockPrisma(THC4_PACK_ID);
    const result = await calculatePackLeaderboards(prisma, THC4_PACK_ID);

    expect(Object.keys(result.leaderboards)).toEqual(['hard', 'challenge']);
    expect(prisma.simfileChart.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ difficulty: { in: ['hard', 'challenge'] } }) }),
    );
  });
});
