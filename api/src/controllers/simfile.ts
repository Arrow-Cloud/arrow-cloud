import { APIGatewayProxyResult } from 'aws-lambda';
import { Prisma, PrismaClient } from '../../prisma/generated/client';
import { ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { z } from 'zod';
import { respond } from '../utils/responses';
import { assetS3UrlToCloudFrontUrl, toCfVariantSet } from '../utils/s3';

// Query parameter schemas for validation
const ListSimfilesQuerySchema = z.object({
  // Pagination
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => Math.max(1, parseInt(val, 10) || 1)),
  limit: z
    .string()
    .optional()
    .default('25')
    .transform((val) => Math.min(100, Math.max(1, parseInt(val, 10) || 25))),

  // Filtering
  search: z.string().optional(), // Search in simfile title, artist
  packId: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),

  // Ordering
  orderBy: z.enum(['title', 'artist', 'createdAt', 'updatedAt', 'chartCount']).optional().default('title'),
  orderDirection: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * List simfiles with pagination, filtering, and ordering
 * GET /v1/simfiles
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 25, max: 100)
 * - search: Search term for simfile title or artist
 * - packId: Filter by pack ID
 * - orderBy: Field to order by (title, artist, createdAt, updatedAt, chartCount)
 * - orderDirection: Order direction (asc, desc)
 */
export async function listSimfiles(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    // Parse and validate query parameters
    const queryParams = event.queryStringParameters || {};
    const validatedQuery = ListSimfilesQuerySchema.parse(queryParams);

    const { page, limit, search, packId, orderBy, orderDirection } = validatedQuery;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: Prisma.SimfileWhereInput = {};

    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          artist: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (packId) {
      where.packId = packId;
    }

    // Build orderBy clause
    let prismaOrderBy: Prisma.SimfileOrderByWithRelationInput;
    switch (orderBy) {
      case 'title':
        prismaOrderBy = { title: orderDirection };
        break;
      case 'artist':
        prismaOrderBy = { artist: orderDirection };
        break;
      case 'createdAt':
        prismaOrderBy = { createdAt: orderDirection };
        break;
      case 'updatedAt':
        prismaOrderBy = { updatedAt: orderDirection };
        break;
      case 'chartCount':
        // For ordering by chart count, we need to use a different approach
        prismaOrderBy = { charts: { _count: orderDirection } };
        break;
      default:
        prismaOrderBy = { title: 'asc' };
    }

    // Execute queries in parallel for better performance
    const [simfiles, totalCount] = await Promise.all([
      prisma.simfile.findMany({
        where,
        orderBy: prismaOrderBy,
        skip,
        take: limit,
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
              chartHash: true, // Add chart hash for linking
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
      }),
      prisma.simfile.count({ where }),
    ]);

    // Transform data for response
    const transformedSimfiles = simfiles.map((simfile) => {
      const hasBanner = !!(simfile.bannerUrl || simfile.mdBannerUrl || simfile.smBannerUrl || simfile.bannerVariants);
      const bannerSource = hasBanner ? simfile : simfile.pack;

      return {
        id: simfile.id,
        title: simfile.title,
        subtitle: simfile.subtitle,
        artist: simfile.artist,
        genre: simfile.genre,
        bannerUrl: assetS3UrlToCloudFrontUrl(bannerSource?.bannerUrl),
        mdBannerUrl: assetS3UrlToCloudFrontUrl(bannerSource?.mdBannerUrl),
        smBannerUrl: assetS3UrlToCloudFrontUrl(bannerSource?.smBannerUrl),
        bannerVariants: toCfVariantSet(bannerSource?.bannerVariants) || undefined,
        backgroundUrl: assetS3UrlToCloudFrontUrl(simfile.backgroundUrl),
        jacketUrl: assetS3UrlToCloudFrontUrl(simfile.jacketUrl),
        chartCount: simfile._count.charts,
        charts: simfile.charts.map((chart) => ({
          hash: chart.chartHash, // Include chart hash for linking
          stepsType: chart.stepsType,
          difficulty: chart.difficulty,
          meter: chart.meter,
        })),
        pack: {
          id: simfile.pack?.id,
          name: simfile.pack?.name,
        },
        createdAt: simfile.createdAt.toISOString(),
        updatedAt: simfile.updatedAt.toISOString(),
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const response = {
      data: transformedSimfiles,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      filters: {
        search,
        packId,
        orderBy,
        orderDirection,
      },
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error listing simfiles:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return respond(400, { error: 'Invalid query parameters', details: error.errors });
    }

    // Handle other errors
    return respond(500, { error: 'Internal server error' });
  }
}

/**
 * Get a single simfile by ID
 * GET /v1/simfile/{simfileId}
 */
export async function getSimfile(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const simfileId = event.routeParameters?.simfileId;

    if (!simfileId) {
      return respond(400, { error: 'Simfile ID is required' });
    }

    const simfile = await prisma.simfile.findUnique({
      where: { id: simfileId },
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

    if (!simfile) {
      return respond(404, { error: 'Simfile not found' });
    }

    const hasBanner = !!(simfile.bannerUrl || simfile.mdBannerUrl || simfile.smBannerUrl || simfile.bannerVariants);
    const bannerSource = hasBanner ? simfile : simfile.pack;

    const response = {
      id: simfile.id,
      title: simfile.title,
      subtitle: simfile.subtitle,
      artist: simfile.artist,
      genre: simfile.genre,
      credit: simfile.credit,
      music: simfile.music,
      banner: simfile.banner,
      background: simfile.background,
      offset: simfile.offset,
      bpms: simfile.bpms,
      stops: simfile.stops,
      version: simfile.version,
      bannerUrl: bannerSource?.bannerUrl ? assetS3UrlToCloudFrontUrl(bannerSource.bannerUrl) : null,
      mdBannerUrl: bannerSource?.mdBannerUrl ? assetS3UrlToCloudFrontUrl(bannerSource.mdBannerUrl) : null,
      smBannerUrl: bannerSource?.smBannerUrl ? assetS3UrlToCloudFrontUrl(bannerSource.smBannerUrl) : null,
      bannerVariants: toCfVariantSet(bannerSource?.bannerVariants) || undefined,
      backgroundUrl: simfile.backgroundUrl,
      jacketUrl: simfile.jacketUrl,
      chartCount: simfile._count.charts,
      pack: simfile.pack ? { id: simfile.pack.id, name: simfile.pack.name } : null,
      charts: simfile.charts.map((simfileChart) => ({
        hash: simfileChart.chartHash,
        stepsType: simfileChart.stepsType || simfileChart.chart?.stepsType,
        difficulty: simfileChart.difficulty || simfileChart.chart?.difficulty,
        meter: simfileChart.meter || simfileChart.chart?.meter,
        chartName: simfileChart.chart?.chartName,
        credit: simfileChart.chart?.credit,
        description: simfileChart.chart?.description,
        radarValues: simfileChart.chart?.radarValues,
        chartBpms: simfileChart.chart?.chartBpms,
        length: simfileChart.chart?.length,
        createdAt: simfileChart.chart?.createdAt.toISOString(),
        updatedAt: simfileChart.chart?.updatedAt.toISOString(),
      })),
      createdAt: simfile.createdAt.toISOString(),
      updatedAt: simfile.updatedAt.toISOString(),
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error getting simfile:', error);

    return respond(500, { error: 'Internal server error' });
  }
}
