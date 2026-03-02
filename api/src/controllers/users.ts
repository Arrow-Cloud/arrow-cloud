import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { z } from 'zod';
import { assetS3UrlToCloudFrontUrl } from '../utils/s3';
import { respond } from '../utils/responses';

// Query parameter schemas for validation
const ListUsersQuerySchema = z.object({
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
  search: z.string().optional(), // Search in alias
  countryId: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),

  // Ordering
  orderBy: z.enum(['alias', 'createdAt']).optional().default('createdAt'),
  orderDirection: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * List users with pagination, filtering, and ordering
 * GET /users
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 25, max: 100)
 * - search: Search term for alias
 * - orderBy: Field to order by (alias, createdAt, playCount)
 * - orderDirection: Order direction (asc, desc) (default: desc for playCount)
 */
export async function listUsers(event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    // Parse and validate query parameters
    const queryParams = event.queryStringParameters || {};
    const validatedQuery = ListUsersQuerySchema.parse(queryParams);

    const { page, limit, search, countryId, orderBy, orderDirection } = validatedQuery;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {
      banned: false, // Exclude banned users
    };
    if (search) {
      where.alias = {
        contains: search,
        mode: 'insensitive', // Case-insensitive search
      };
    }
    if (countryId) {
      where.countryId = countryId;
    }

    // Build orderBy clause
    let prismaOrderBy: any;
    switch (orderBy) {
      case 'alias':
        prismaOrderBy = { alias: orderDirection };
        break;
      case 'createdAt':
        prismaOrderBy = { createdAt: orderDirection };
        break;
      default:
        prismaOrderBy = { createdAt: 'desc' };
    }

    // Execute queries in parallel for better performance
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: prismaOrderBy,
        skip,
        take: limit,
        select: {
          id: true,
          alias: true,
          profileImageUrl: true,
          country: {
            select: {
              name: true,
            },
          },
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // Transform data for response
    const responseData = users.map((user) => ({
      id: user.id,
      alias: user.alias,
      profileImageUrl: user.profileImageUrl ? assetS3UrlToCloudFrontUrl(user.profileImageUrl) : null,
      country: user.country?.name || null,
      createdAt: user.createdAt.toISOString(),
    }));

    return respond(200, {
      data: responseData,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      filters: {
        search: search || undefined,
        orderBy,
        orderDirection,
      },
    });
  } catch (error) {
    console.error('Error listing users:', error);

    if (error instanceof z.ZodError) {
      return respond(400, { error: 'Invalid query parameters', details: error.errors });
    }

    return respond(500, { error: 'Internal server error' });
  }
}
