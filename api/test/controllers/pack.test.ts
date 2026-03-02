import { PrismaClient } from '../../prisma/generated/client';
import { listPacks, getPack } from '../../src/controllers/pack';
import { ExtendedAPIGatewayProxyEvent } from '../../src/utils/types';

// Mock the s3 utilities
jest.mock('../../src/utils/s3', () => ({
  assetS3UrlToCloudFrontUrl: jest.fn((url) => (url ? url.replace('s3://arrow-cloud-assets', 'https://d31dik069m7bb1.cloudfront.net') : null)),
  // Pass-through mock for variant set conversion so controllers don't throw
  toCfVariantSet: jest.fn((vs) => (vs ? vs : undefined)),
}));

// Mock Prisma
const mockPrisma = {
  pack: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  play: {
    findMany: jest.fn(),
  },
} as unknown as PrismaClient;

// Helper function to create mock events
const createMockEvent = (
  queryStringParameters: Record<string, string> | null = null,
  routeParameters: Record<string, string> | undefined = undefined,
): ExtendedAPIGatewayProxyEvent => ({
  body: null,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'GET',
  isBase64Encoded: false,
  path: '/v1/packs',
  pathParameters: null,
  queryStringParameters,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {} as any,
  resource: '',
  routeParameters,
});

describe('Pack Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listPacks', () => {
    it('should return paginated pack list with default parameters', async () => {
      const mockPacks = [
        {
          id: 1,
          name: 'Test Pack 1',
          bannerUrl: 's3://arrow-cloud-assets/banner1.jpg',
          mdBannerUrl: null,
          smBannerUrl: null,
          bannerVariants: null,
          popularity: 25.5,
          popularityUpdatedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          _count: { simfiles: 5 },
        },
        {
          id: 2,
          name: 'Test Pack 2',
          bannerUrl: null,
          mdBannerUrl: null,
          smBannerUrl: null,
          bannerVariants: null,
          popularity: 10.2,
          popularityUpdatedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
          _count: { simfiles: 3 },
        },
      ];

      (mockPrisma.pack.findMany as jest.Mock).mockResolvedValue(mockPacks);
      (mockPrisma.pack.count as jest.Mock).mockResolvedValue(2);
      (mockPrisma.pack.findFirst as jest.Mock).mockResolvedValue({ popularity: 25.5 });

      const event = createMockEvent();
      const result = await listPacks(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body);
      expect(response.data).toHaveLength(2);
      expect(response.data[0]).toEqual({
        id: 1,
        name: 'Test Pack 1',
        bannerUrl: 'https://d31dik069m7bb1.cloudfront.net/banner1.jpg',
        mdBannerUrl: null,
        smBannerUrl: null,
        simfileCount: 5,
        popularity: 25.5,
        popularityUpdatedAt: '2024-01-15T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      expect(response.data[1]).toEqual({
        id: 2,
        name: 'Test Pack 2',
        bannerUrl: null,
        mdBannerUrl: null,
        smBannerUrl: null,
        simfileCount: 3,
        popularity: 10.2,
        popularityUpdatedAt: '2024-01-15T00:00:00.000Z',
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      });
      expect(response.meta.page).toBe(1);
      expect(response.meta.limit).toBe(25);
      expect(response.meta.total).toBe(2);
      expect(response.meta.totalPages).toBe(1);
      expect(response.meta.hasNextPage).toBe(false);
      expect(response.meta.hasPreviousPage).toBe(false);
      expect(response.meta.maxPopularity).toBe(25.5);
      expect(response.filters).toEqual({
        search: undefined,
        orderBy: 'popularity',
        orderDirection: 'desc',
      });

      expect(mockPrisma.pack.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { popularity: 'desc' },
        skip: 0,
        take: 25,
        include: {
          _count: {
            select: {
              simfiles: true,
            },
          },
        },
      });
    });

    it('should handle pagination parameters', async () => {
      (mockPrisma.pack.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.pack.count as jest.Mock).mockResolvedValue(100);
      (mockPrisma.pack.findFirst as jest.Mock).mockResolvedValue({ popularity: 0 });

      const event = createMockEvent({ page: '3', limit: '10' });
      const result = await listPacks(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body);
      expect(response.meta.page).toBe(3);
      expect(response.meta.limit).toBe(10);
      expect(response.meta.totalPages).toBe(10);
      expect(response.meta.hasNextPage).toBe(true);
      expect(response.meta.hasPreviousPage).toBe(true);

      expect(mockPrisma.pack.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { popularity: 'desc' },
        skip: 20, // (page - 1) * limit = (3 - 1) * 10
        take: 10,
        include: {
          _count: {
            select: {
              simfiles: true,
            },
          },
        },
      });
    });

    it('should handle search filtering', async () => {
      (mockPrisma.pack.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.pack.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.pack.findFirst as jest.Mock).mockResolvedValue(null);

      const event = createMockEvent({ search: 'test pack' });
      const result = await listPacks(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body);
      expect(response.filters.search).toBe('test pack');

      expect(mockPrisma.pack.findMany).toHaveBeenCalledWith({
        where: {
          name: {
            contains: 'test pack',
            mode: 'insensitive',
          },
        },
        orderBy: { popularity: 'desc' },
        skip: 0,
        take: 25,
        include: {
          _count: {
            select: {
              simfiles: true,
            },
          },
        },
      });
    });

    it('should handle ordering parameters', async () => {
      (mockPrisma.pack.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.pack.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.pack.findFirst as jest.Mock).mockResolvedValue(null);

      const event = createMockEvent({ orderBy: 'createdAt', orderDirection: 'desc' });
      const result = await listPacks(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      expect(mockPrisma.pack.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 25,
        include: {
          _count: {
            select: {
              simfiles: true,
            },
          },
        },
      });
    });

    it('should handle simfileCount ordering', async () => {
      (mockPrisma.pack.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.pack.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.pack.findFirst as jest.Mock).mockResolvedValue(null);

      const event = createMockEvent({ orderBy: 'simfileCount', orderDirection: 'desc' });
      const result = await listPacks(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      expect(mockPrisma.pack.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { simfiles: { _count: 'desc' } },
        skip: 0,
        take: 25,
        include: {
          _count: {
            select: {
              simfiles: true,
            },
          },
        },
      });
    });

    it('should validate query parameters and return 400 for invalid input', async () => {
      const event = createMockEvent({ page: 'invalid', orderBy: 'invalid_field' });
      const result = await listPacks(event, mockPrisma);

      expect(result.statusCode).toBe(400);

      const response = JSON.parse(result.body);
      expect(response.error).toBe('Invalid query parameters');
      expect(response.details).toBeDefined();
    });

    it('should handle database errors', async () => {
      (mockPrisma.pack.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const event = createMockEvent();
      const result = await listPacks(event, mockPrisma);

      expect(result.statusCode).toBe(500);

      const response = JSON.parse(result.body);
      expect(response.error).toBe('Internal server error');
    });
  });

  describe('getPack', () => {
    it('should return pack details with recent plays', async () => {
      const mockPack = {
        id: 1,
        name: 'Test Pack',
        bannerUrl: 's3://arrow-cloud-assets/banner.jpg',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        _count: { simfiles: 2 },
      };

      const mockRecentPlays = [
        {
          id: 101,
          createdAt: new Date('2024-01-01T10:00:00Z'),
          PlayLeaderboard: [
            {
              data: { score: 950000 },
              leaderboard: { type: 'default' },
            },
          ],
          user: { id: 'user-1', alias: 'TestUser1' },
          chart: {
            hash: 'hash-abc',
            songName: 'Song 1',
            artist: 'Artist 1',
            stepsType: 'dance-single',
            difficulty: 'Expert',
            meter: 12,
            simfiles: [
              {
                simfile: {
                  title: 'Song 1',
                  subtitle: 'Subtitle 1',
                  artist: 'Artist 1',
                  bannerUrl: 's3://arrow-cloud-assets/song1-banner.jpg',
                },
              },
            ],
          },
        },
      ];

      (mockPrisma.pack.findUnique as jest.Mock).mockResolvedValue(mockPack);
      (mockPrisma.play.findMany as jest.Mock).mockResolvedValue(mockRecentPlays);

      const event = createMockEvent(null, { packId: '1' });
      const result = await getPack(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body);
      expect(response.id).toBe(1);
      expect(response.name).toBe('Test Pack');
      expect(response.bannerUrl).toBe('https://d31dik069m7bb1.cloudfront.net/banner.jpg');
      expect(response.simfileCount).toBe(2);
      expect(response.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(response.updatedAt).toBe('2024-01-01T00:00:00.000Z');
      expect(response.recentPlays).toHaveLength(1);
      expect(response.recentPlays[0]).toEqual({
        playId: 101,
        chart: {
          hash: 'hash-abc',
          bannerUrl: 'https://d31dik069m7bb1.cloudfront.net/song1-banner.jpg',
          mdBannerUrl: null,
          smBannerUrl: null,
          title: 'Song 1',
          artist: 'Artist 1',
          stepsType: 'dance-single',
          difficulty: 'Expert',
          meter: 12,
        },
        user: {
          id: 'user-1',
          alias: 'TestUser1',
        },
        leaderboards: [
          {
            leaderboard: 'default',
            data: { score: 950000 },
          },
        ],
        createdAt: '2024-01-01T10:00:00.000Z',
      });

      expect(mockPrisma.pack.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          _count: {
            select: {
              simfiles: true,
            },
          },
        },
      });

      expect(mockPrisma.play.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          createdAt: true,
          PlayLeaderboard: {
            select: {
              data: true,
              leaderboard: {
                select: {
                  type: true,
                },
              },
            },
            where: {
              leaderboardId: {
                in: [4, 2, 3],
              },
            },
          },
          user: {
            select: {
              id: true,
              alias: true,
            },
          },
          chart: {
            select: {
              hash: true,
              songName: true,
              artist: true,
              stepsType: true,
              difficulty: true,
              meter: true,
              simfiles: {
                select: {
                  chartName: true,
                  stepsType: true,
                  description: true,
                  meter: true,
                  credit: true,
                  createdAt: true,
                  simfile: {
                    select: {
                      title: true,
                      subtitle: true,
                      artist: true,
                      bannerUrl: true,
                      mdBannerUrl: true,
                      smBannerUrl: true,
                      bannerVariants: true,
                      pack: {
                        select: {
                          bannerUrl: true,
                          mdBannerUrl: true,
                          smBannerUrl: true,
                          bannerVariants: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        where: {
          AND: [
            {
              chart: {
                simfiles: {
                  some: {
                    simfile: {
                      pack: {
                        id: 1,
                      },
                    },
                  },
                },
              },
            },
            {
              PlayLeaderboard: {
                some: {
                  leaderboardId: {
                    in: [4, 2, 3],
                  },
                },
              },
            },
            {},
          ],
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 0,
        take: 5,
      });
    });

    it('should return 404 when pack not found', async () => {
      (mockPrisma.pack.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.play.findMany as jest.Mock).mockResolvedValue([]);

      const event = createMockEvent(null, { packId: '999' });
      const result = await getPack(event, mockPrisma);

      expect(result.statusCode).toBe(404);

      const response = JSON.parse(result.body);
      expect(response.error).toBe('Pack not found');
    });

    it('should return 400 when packId is missing', async () => {
      const event = createMockEvent(null, undefined);
      const result = await getPack(event, mockPrisma);

      expect(result.statusCode).toBe(400);

      const response = JSON.parse(result.body);
      expect(response.error).toBe('Pack ID is required');
    });

    it('should handle database errors', async () => {
      (mockPrisma.pack.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const event = createMockEvent(null, { packId: '1' });
      const result = await getPack(event, mockPrisma);

      expect(result.statusCode).toBe(500);

      const response = JSON.parse(result.body);
      expect(response.error).toBe('Internal server error');
    });

    it('should handle chart fallback data when simfile data is null', async () => {
      const mockPack = {
        id: 1,
        name: 'Test Pack',
        bannerUrl: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        _count: { simfiles: 1 },
      };

      const mockRecentPlays = [
        {
          createdAt: new Date('2024-01-01T10:00:00Z'),
          PlayLeaderboard: [],
          user: { alias: 'TestUser2' },
          chart: {
            songName: 'Chart Song Name',
            artist: 'Chart Artist',
            stepsType: 'dance-double',
            difficulty: 'Challenge',
            meter: 15,
            simfiles: [],
          },
        },
      ];

      (mockPrisma.pack.findUnique as jest.Mock).mockResolvedValue(mockPack);
      (mockPrisma.play.findMany as jest.Mock).mockResolvedValue(mockRecentPlays);

      const event = createMockEvent(null, { packId: '1' });
      const result = await getPack(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body);
      expect(response.recentPlays[0].chart.title).toBe('Chart Song Name');
      expect(response.recentPlays[0].chart.artist).toBe('Chart Artist');
      expect(response.recentPlays[0].chart.bannerUrl).toBe(null);
      expect(response.recentPlays[0].chart.mdBannerUrl).toBe(null);
      expect(response.recentPlays[0].chart.smBannerUrl).toBe(null);
    });
  });
});
