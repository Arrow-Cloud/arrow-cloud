import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { respond } from '../utils/responses';
import { resolveChartBanner } from '../utils/chart-banner';
import { z } from 'zod';

/**
 * Get event information
 * GET /event/{eventId}
 */
export async function getEvent(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  const eventId = parseInt(event.routeParameters?.eventId || '', 10);

  try {
    const eventRecord = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        slug: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!eventRecord) {
      return respond(404, { error: 'Event not found' });
    }

    return respond(200, { event: eventRecord });
  } catch (error) {
    console.error('Error getting event:', error);
    return respond(500, { error: 'Internal server error' });
  }
}

const EventChartsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => Math.max(1, parseInt(val, 10) || 1)),
  limit: z
    .string()
    .optional()
    .default('25')
    .transform((val) => Math.min(50, Math.max(1, parseInt(val, 10) || 25))),
});

/**
 * Get paginated charts for an event
 * GET /event/{eventId}/charts
 */
export async function getEventCharts(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  const eventId = parseInt(event.routeParameters?.eventId || '', 10);

  try {
    const queryParams = event.queryStringParameters || {};
    const { page, limit } = EventChartsQuerySchema.parse(queryParams);
    const skip = (page - 1) * limit;

    const [charts, totalCount] = await Promise.all([
      prisma.eventChart.findMany({
        where: { eventId },
        skip,
        take: limit,
        include: {
          chart: {
            select: {
              hash: true,
              songName: true,
              artist: true,
              rating: true,
              stepsType: true,
              difficulty: true,
              meter: true,
              stepartist: true,
              credit: true,
              simfiles: {
                orderBy: { createdAt: 'asc' },
                select: {
                  createdAt: true,
                  simfile: {
                    select: {
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
        orderBy: { id: 'asc' },
      }),
      prisma.eventChart.count({ where: { eventId } }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    const data = charts.map((eventChart) => ({
      id: eventChart.id,
      eventId: eventChart.eventId,
      chartHash: eventChart.chartHash,
      metadata: eventChart.metadata,
      chart: {
        hash: eventChart.chart.hash,
        songName: eventChart.chart.songName,
        artist: eventChart.chart.artist,
        rating: eventChart.chart.rating,
        stepsType: eventChart.chart.stepsType,
        difficulty: eventChart.chart.difficulty,
        meter: eventChart.chart.meter,
        stepartist: eventChart.chart.stepartist,
        credit: eventChart.chart.credit,
        ...resolveChartBanner(eventChart.chart.simfiles),
      },
    }));

    return respond(200, {
      data,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respond(400, { error: 'Invalid query parameters', details: error.errors });
    }
    console.error('Error getting event charts:', error);
    return respond(500, { error: 'Internal server error' });
  }
}

/**
 * Get a single chart's event-specific data (points, metadata) plus full chart details
 * GET /event/{eventId}/chart/{chartHash}
 */
export async function getEventChart(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  const eventId = parseInt(event.routeParameters?.eventId || '', 10);
  const chartHash = event.routeParameters?.chartHash || '';

  try {
    const eventChart = await prisma.eventChart.findUnique({
      where: { eventId_chartHash: { eventId, chartHash } },
      include: {
        chart: {
          select: {
            hash: true,
            songName: true,
            artist: true,
            rating: true,
            length: true,
            stepsType: true,
            difficulty: true,
            meter: true,
            stepartist: true,
            credit: true,
            simfiles: {
              orderBy: { createdAt: 'asc' },
              select: {
                createdAt: true,
                simfile: {
                  select: {
                    bannerUrl: true,
                    mdBannerUrl: true,
                    smBannerUrl: true,
                    bannerVariants: true,
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
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!eventChart) {
      return respond(404, { error: 'Event chart not found' });
    }

    return respond(200, {
      eventChart: {
        id: eventChart.id,
        eventId: eventChart.eventId,
        chartHash: eventChart.chartHash,
        metadata: eventChart.metadata,
        chart: {
          hash: eventChart.chart.hash,
          songName: eventChart.chart.songName,
          artist: eventChart.chart.artist,
          rating: eventChart.chart.rating,
          length: eventChart.chart.length,
          stepsType: eventChart.chart.stepsType,
          difficulty: eventChart.chart.difficulty,
          meter: eventChart.chart.meter,
          stepartist: eventChart.chart.stepartist,
          credit: eventChart.chart.credit,
          ...resolveChartBanner(eventChart.chart.simfiles),
        },
      },
    });
  } catch (error) {
    console.error('Error getting event chart:', error);
    return respond(500, { error: 'Internal server error' });
  }
}
