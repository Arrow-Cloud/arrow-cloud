import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { respond } from '../utils/responses';

/**
 * Get all countries
 * GET /countries
 */
export async function getCountries(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const countries = await prisma.country.findMany({
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return respond(200, { countries });
  } catch (error) {
    console.error('Error getting countries:', error);
    return respond(500, { error: 'Internal server error' });
  }
}
