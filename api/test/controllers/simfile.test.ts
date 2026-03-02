import { PrismaClient } from '../../prisma/generated/client';
import { listSimfiles, getSimfile } from '../../src/controllers/simfile';
import { ExtendedAPIGatewayProxyEvent } from '../../src/utils/types';

// Mock s3 utils to include variant helper
jest.mock('../../src/utils/s3', () => ({
  assetS3UrlToCloudFrontUrl: jest.fn((url) => url),
  toCfVariantSet: jest.fn((vs) => (vs ? vs : undefined)),
}));

// Mock Prisma
const mockPrisma = {
  simfile: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
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
  path: '/v1/simfiles',
  pathParameters: null,
  queryStringParameters,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {} as any,
  resource: '',
  routeParameters,
});

describe('Simfile Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listSimfiles', () => {
    it('should return paginated simfile list with default parameters', async () => {
      const mockSimfiles = [
        {
          id: 'simfile-1',
          title: 'Test Song 1',
          subtitle: 'Test Subtitle',
          artist: 'Test Artist 1',
          genre: 'Electronic',
          bannerUrl: 'http://example.com/banner1.jpg',
          backgroundUrl: null,
          jacketUrl: 'http://example.com/jacket1.jpg',
          packId: 1,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          _count: { charts: 5 },
          pack: {
            id: 1,
            name: 'Test Pack 1',
          },
          charts: [
            {
              stepsType: 'dance-single',
              difficulty: 'Expert',
              meter: 9,
              chart: {
                stepsType: 'dance-single',
                difficulty: 'Expert',
                meter: 9,
              },
            },
            {
              stepsType: 'dance-double',
              difficulty: 'Challenge',
              meter: 12,
              chart: {
                stepsType: 'dance-double',
                difficulty: 'Challenge',
                meter: 12,
              },
            },
          ],
        },
        {
          id: 'simfile-2',
          title: 'Test Song 2',
          subtitle: null,
          artist: 'Test Artist 2',
          genre: 'Rock',
          bannerUrl: null,
          backgroundUrl: 'http://example.com/bg2.jpg',
          jacketUrl: null,
          packId: 2,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
          _count: { charts: 3 },
          pack: {
            id: 2,
            name: 'Test Pack 2',
          },
          charts: [
            {
              stepsType: 'dance-single',
              difficulty: 'Expert',
              meter: 9,
              chart: {
                stepsType: 'dance-single',
                difficulty: 'Expert',
                meter: 9,
              },
            },
            {
              stepsType: 'dance-double',
              difficulty: 'Challenge',
              meter: 12,
              chart: {
                stepsType: 'dance-double',
                difficulty: 'Challenge',
                meter: 12,
              },
            },
          ],
        },
      ];

      (mockPrisma.simfile.findMany as jest.Mock).mockResolvedValue(mockSimfiles);
      (mockPrisma.simfile.count as jest.Mock).mockResolvedValue(2);

      const event = createMockEvent();
      const result = await listSimfiles(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body);
      expect(response.data).toHaveLength(2);
      expect(response.meta.page).toBe(1);
      expect(response.meta.limit).toBe(25);
      expect(response.meta.total).toBe(2);
      expect(response.meta.totalPages).toBe(1);
      expect(response.meta.hasNextPage).toBe(false);
      expect(response.meta.hasPreviousPage).toBe(false);

      expect(mockPrisma.simfile.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { title: 'asc' },
        skip: 0,
        take: 25,
        include: {
          pack: {
            select: {
              id: true,
              name: true,
              bannerUrl: true,
              mdBannerUrl: true,
              smBannerUrl: true,
              bannerVariants: true,
            },
          },
          charts: {
            select: {
              stepsType: true,
              difficulty: true,
              meter: true,
              chartHash: true,
              chart: {
                select: {
                  stepsType: true,
                  difficulty: true,
                  meter: true,
                },
              },
            },
          },
          _count: {
            select: {
              charts: true,
            },
          },
        },
      });
    });

    it('should handle pagination parameters', async () => {
      (mockPrisma.simfile.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.simfile.count as jest.Mock).mockResolvedValue(100);

      const event = createMockEvent({ page: '3', limit: '10' });
      const result = await listSimfiles(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body);
      expect(response.meta.page).toBe(3);
      expect(response.meta.limit).toBe(10);
      expect(response.meta.totalPages).toBe(10);
      expect(response.meta.hasNextPage).toBe(true);
      expect(response.meta.hasPreviousPage).toBe(true);

      expect(mockPrisma.simfile.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { title: 'asc' },
        skip: 20, // (page - 1) * limit = (3 - 1) * 10
        take: 10,
        include: {
          pack: {
            select: {
              id: true,
              name: true,
              bannerUrl: true,
              mdBannerUrl: true,
              smBannerUrl: true,
              bannerVariants: true,
            },
          },
          charts: {
            select: {
              chartHash: true,
              stepsType: true,
              difficulty: true,
              meter: true,
              chart: {
                select: {
                  stepsType: true,
                  difficulty: true,
                  meter: true,
                },
              },
            },
          },
          _count: {
            select: {
              charts: true,
            },
          },
        },
      });
    });

    it('should handle search filtering across title and artist', async () => {
      (mockPrisma.simfile.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.simfile.count as jest.Mock).mockResolvedValue(0);

      const event = createMockEvent({ search: 'test song' });
      const result = await listSimfiles(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      expect(mockPrisma.simfile.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            {
              title: {
                contains: 'test song',
                mode: 'insensitive',
              },
            },
            {
              artist: {
                contains: 'test song',
                mode: 'insensitive',
              },
            },
          ],
        },
        orderBy: { title: 'asc' },
        skip: 0,
        take: 25,
        include: {
          pack: {
            select: {
              id: true,
              name: true,
              bannerUrl: true,
              mdBannerUrl: true,
              smBannerUrl: true,
              bannerVariants: true,
            },
          },
          charts: {
            select: {
              chartHash: true,
              stepsType: true,
              difficulty: true,
              meter: true,
              chart: {
                select: {
                  stepsType: true,
                  difficulty: true,
                  meter: true,
                },
              },
            },
          },
          _count: {
            select: {
              charts: true,
            },
          },
        },
      });
    });

    it('should handle pack filtering', async () => {
      (mockPrisma.simfile.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.simfile.count as jest.Mock).mockResolvedValue(0);

      const event = createMockEvent({ packId: '5' });
      const result = await listSimfiles(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      expect(mockPrisma.simfile.findMany).toHaveBeenCalledWith({
        where: {
          packId: 5,
        },
        orderBy: { title: 'asc' },
        skip: 0,
        take: 25,
        include: {
          pack: {
            select: {
              id: true,
              name: true,
              bannerUrl: true,
              mdBannerUrl: true,
              smBannerUrl: true,
              bannerVariants: true,
            },
          },
          charts: {
            select: {
              chartHash: true,
              stepsType: true,
              difficulty: true,
              meter: true,
              chart: {
                select: {
                  stepsType: true,
                  difficulty: true,
                  meter: true,
                },
              },
            },
          },
          _count: {
            select: {
              charts: true,
            },
          },
        },
      });
    });

    it('should handle combined search and pack filtering', async () => {
      (mockPrisma.simfile.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.simfile.count as jest.Mock).mockResolvedValue(0);

      const event = createMockEvent({ search: 'test', packId: '3' });
      const result = await listSimfiles(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      expect(mockPrisma.simfile.findMany).toHaveBeenCalledWith({
        where: {
          packId: 3,
          OR: [
            {
              title: {
                contains: 'test',
                mode: 'insensitive',
              },
            },
            {
              artist: {
                contains: 'test',
                mode: 'insensitive',
              },
            },
          ],
        },
        orderBy: { title: 'asc' },
        skip: 0,
        take: 25,
        include: {
          pack: {
            select: {
              id: true,
              name: true,
              bannerUrl: true,
              mdBannerUrl: true,
              smBannerUrl: true,
              bannerVariants: true,
            },
          },
          charts: {
            select: {
              chartHash: true,
              stepsType: true,
              difficulty: true,
              meter: true,
              chart: {
                select: {
                  stepsType: true,
                  difficulty: true,
                  meter: true,
                },
              },
            },
          },
          _count: {
            select: {
              charts: true,
            },
          },
        },
      });
    });

    it('should handle ordering parameters', async () => {
      (mockPrisma.simfile.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.simfile.count as jest.Mock).mockResolvedValue(0);

      const event = createMockEvent({ orderBy: 'artist', orderDirection: 'desc' });
      const result = await listSimfiles(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      expect(mockPrisma.simfile.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { artist: 'desc' },
        skip: 0,
        take: 25,
        include: {
          pack: {
            select: {
              id: true,
              name: true,
              bannerUrl: true,
              mdBannerUrl: true,
              smBannerUrl: true,
              bannerVariants: true,
            },
          },
          charts: {
            select: {
              chartHash: true,
              stepsType: true,
              difficulty: true,
              meter: true,
              chart: {
                select: {
                  stepsType: true,
                  difficulty: true,
                  meter: true,
                },
              },
            },
          },
          _count: {
            select: {
              charts: true,
            },
          },
        },
      });
    });

    it('should handle chartCount ordering', async () => {
      (mockPrisma.simfile.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.simfile.count as jest.Mock).mockResolvedValue(0);

      const event = createMockEvent({ orderBy: 'chartCount', orderDirection: 'desc' });
      const result = await listSimfiles(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      expect(mockPrisma.simfile.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { charts: { _count: 'desc' } },
        skip: 0,
        take: 25,
        include: {
          pack: {
            select: {
              id: true,
              name: true,
              bannerUrl: true,
              mdBannerUrl: true,
              smBannerUrl: true,
              bannerVariants: true,
            },
          },
          charts: {
            select: {
              chartHash: true,
              stepsType: true,
              difficulty: true,
              meter: true,
              chart: {
                select: {
                  stepsType: true,
                  difficulty: true,
                  meter: true,
                },
              },
            },
          },
          _count: {
            select: {
              charts: true,
            },
          },
        },
      });
    });

    it('should validate query parameters and return 400 for invalid input', async () => {
      const event = createMockEvent({ page: 'invalid', orderBy: 'invalid_field', packId: 'not_a_number' });
      const result = await listSimfiles(event, mockPrisma);

      expect(result.statusCode).toBe(400);

      const response = JSON.parse(result.body);
      expect(response.error).toBe('Invalid query parameters');
      expect(response.details).toBeDefined();
    });

    it('should handle database errors', async () => {
      (mockPrisma.simfile.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const event = createMockEvent();
      const result = await listSimfiles(event, mockPrisma);

      expect(result.statusCode).toBe(500);

      const response = JSON.parse(result.body);
      expect(response.error).toBe('Internal server error');
    });
  });

  describe('getSimfile', () => {
    it('should return simfile details with charts and pack', async () => {
      const mockSimfile = {
        id: 'simfile-1',
        title: 'Test Song',
        subtitle: 'Test Subtitle',
        artist: 'Test Artist',
        genre: 'Electronic',
        bannerUrl: 'http://example.com/banner.jpg',
        backgroundUrl: null,
        jacketUrl: 'http://example.com/jacket.jpg',
        packId: 1,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        _count: { charts: 3 },
        pack: {
          id: 1,
          name: 'Test Pack',
          bannerUrl: 'http://example.com/pack-banner.jpg',
        },
        charts: [
          {
            chartHash: 'chart-1',
            stepsType: 'dance-single',
            difficulty: 'Expert',
            meter: 8,
            chart: {
              stepsType: 'dance-single',
              difficulty: 'Expert',
              meter: 8,
              chartName: 'Test Chart 1',
              credit: 'Test Stepper',
              description: 'Test description',
              radarValues: '0,0,0,0,0',
              chartBpms: '120,120',
              length: '2:30',
              createdAt: new Date('2024-01-01'),
              updatedAt: new Date('2024-01-01'),
            },
          },
          {
            chartHash: 'chart-2',
            stepsType: 'dance-single',
            difficulty: 'Challenge',
            meter: 12,
            chart: {
              stepsType: 'dance-single',
              difficulty: 'Challenge',
              meter: 12,
              chartName: 'Test Chart 2',
              credit: 'Test Stepper',
              description: 'Test description',
              radarValues: '0,0,0,0,0',
              chartBpms: '120,120',
              length: '2:30',
              createdAt: new Date('2024-01-01'),
              updatedAt: new Date('2024-01-01'),
            },
          },
          {
            chartHash: 'chart-3',
            stepsType: 'dance-double',
            difficulty: 'Expert',
            meter: 10,
            chart: {
              stepsType: 'dance-double',
              difficulty: 'Expert',
              meter: 10,
              chartName: 'Test Chart 3',
              credit: 'Test Stepper',
              description: 'Test description',
              radarValues: '0,0,0,0,0',
              chartBpms: '120,120',
              length: '2:30',
              createdAt: new Date('2024-01-01'),
              updatedAt: new Date('2024-01-01'),
            },
          },
        ],
      };

      (mockPrisma.simfile.findUnique as jest.Mock).mockResolvedValue(mockSimfile);

      const event = createMockEvent(null, { simfileId: 'simfile-1' });
      const result = await getSimfile(event, mockPrisma);

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body);
      expect(response.id).toBe('simfile-1');
      expect(response.title).toBe('Test Song');
      expect(response.chartCount).toBe(3);
      expect(response.charts).toHaveLength(3);
      expect(response.pack.id).toBe(1);
      expect(response.pack.name).toBe('Test Pack');

      expect(mockPrisma.simfile.findUnique).toHaveBeenCalledWith({
        where: { id: 'simfile-1' },
        include: {
          pack: {
            select: {
              id: true,
              name: true,
              bannerUrl: true,
              mdBannerUrl: true,
              smBannerUrl: true,
              bannerVariants: true,
            },
          },
          charts: {
            select: {
              chartHash: true,
              stepsType: true,
              difficulty: true,
              meter: true,
              chart: {
                select: {
                  stepsType: true,
                  difficulty: true,
                  meter: true,
                  chartName: true,
                  credit: true,
                  description: true,
                  radarValues: true,
                  chartBpms: true,
                  length: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
            orderBy: [{ stepsType: 'asc' }, { difficulty: 'asc' }, { meter: 'asc' }],
          },
          _count: {
            select: {
              charts: true,
            },
          },
        },
      });
    });

    it('should return 404 when simfile not found', async () => {
      (mockPrisma.simfile.findUnique as jest.Mock).mockResolvedValue(null);

      const event = createMockEvent(null, { simfileId: 'non-existent' });
      const result = await getSimfile(event, mockPrisma);

      expect(result.statusCode).toBe(404);

      const response = JSON.parse(result.body);
      expect(response.error).toBe('Simfile not found');
    });

    it('should return 400 when simfileId is missing', async () => {
      const event = createMockEvent(null, undefined);
      const result = await getSimfile(event, mockPrisma);

      expect(result.statusCode).toBe(400);

      const response = JSON.parse(result.body);
      expect(response.error).toBe('Simfile ID is required');
    });

    it('should handle database errors', async () => {
      (mockPrisma.simfile.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const event = createMockEvent(null, { simfileId: 'simfile-1' });
      const result = await getSimfile(event, mockPrisma);

      expect(result.statusCode).toBe(500);

      const response = JSON.parse(result.body);
      expect(response.error).toBe('Internal server error');
    });
  });
});
