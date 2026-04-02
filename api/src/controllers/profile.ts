import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient, Prisma } from '../../prisma/generated/client';
import { verifyPassword, hashPassword, generateSalt } from '../utils/password';
import { z } from 'zod';
import { AuthenticatedEvent, ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { internalServerErrorResponse, respond } from '../utils/responses';
import { assetS3UrlToCloudFrontUrl } from '../utils/s3';
import { getUserPreferredLeaderboardIds, setUserPreferredLeaderboards, UpdatePreferredLeaderboardsSchema } from '../services/userPreferredLeaderboards';
import { getUserTrophies, updateTrophyDisplayOrder } from '../services/trophies';
import { publishDiscordMessage } from '../utils/discordNotify';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { resolveChartBanner } from '../utils/chart-banner';

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-2' });

const S3_BUCKET_ASSETS = process.env.S3_BUCKET_ASSETS || 'arrow-cloud-assets';

/**
 * Fetch Blue Shift event data for a user from S3
 */
async function fetchBlueShiftUserData(userId: string): Promise<any | null> {
  try {
    const s3Client = new S3Client();
    const key = `json/blueshift/user/${userId}.json`;

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_ASSETS,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      return null;
    }

    const bodyString = await response.Body.transformToString();
    return JSON.parse(bodyString);
  } catch (error) {
    // If file doesn't exist or other error, just return null
    console.log(`No Blue Shift data found for user ${userId}:`, error);
    return null;
  }
}

const UpdateProfileRequestSchema = z
  .object({
    alias: z
      .string()
      .min(3, 'Alias must be at least 3 characters long')
      .max(50, 'Alias must be no more than 50 characters long')
      .regex(/^\S+$/, 'Alias must not contain spaces')
      .optional(),
    countryId: z.number().int().positive('Please select a valid country').optional(),
    timezone: z.string().max(100, 'Invalid timezone').optional(),
    currentPassword: z.string().min(1, 'Current password is required').optional(),
    newPassword: z.string().min(6, 'New password must be at least 6 characters long').optional(),
  })
  .refine(
    (data) => {
      // If newPassword is provided, currentPassword must also be provided
      if (data.newPassword && !data.currentPassword) {
        return false;
      }
      return true;
    },
    {
      message: 'Current password is required when setting a new password',
      path: ['currentPassword'],
    },
  );

// Query parameter schemas for listing recent plays
const ListUserRecentPlaysQuerySchema = z.object({
  // Pagination
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => Math.max(1, parseInt(val, 10) || 1)),
  limit: z
    .string()
    .optional()
    .default('10')
    .transform((val) => Math.min(100, Math.max(1, parseInt(val, 10) || 10))),

  // Filtering
  search: z.string().optional(), // search by chart/simfile title or artist
  leaderboard: z.string().optional(), // filter to only plays that have this leaderboard type
  minMeter: z
    .string()
    .optional()
    .transform((v) => (v !== undefined && v !== '' ? (Number.isNaN(parseInt(v, 10)) ? undefined : parseInt(v, 10)) : undefined)),
  maxMeter: z
    .string()
    .optional()
    .transform((v) => (v !== undefined && v !== '' ? (Number.isNaN(parseInt(v, 10)) ? undefined : parseInt(v, 10)) : undefined)),

  // Include charts with unknown/null meter (default true)
  includeUnknown: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return true;
      const low = v.toLowerCase();
      return low === 'true' || low === '1' || low === 'yes';
    }),

  // Sorting
  orderBy: z.enum(['date', 'score']).optional().default('date'),
  orderDirection: z.enum(['asc', 'desc']).optional().default('desc'),
});

type RecentPlaysOptions = {
  page: number;
  limit: number;
  search?: string;
  leaderboard?: string;
  minMeter?: number;
  maxMeter?: number;
  includeUnknown?: boolean;
  orderBy: 'date' | 'score';
  orderDirection: 'asc' | 'desc';
};

const getRecentPlaysForUser = async (userId: string, prisma: PrismaClient, opts: RecentPlaysOptions) => {
  // Build where clause for plays
  const where: any = {
    userId,
  };

  if (opts.search) {
    const term = opts.search;
    where.OR = [
      { chart: { songName: { contains: term, mode: 'insensitive' } } },
      { chart: { artist: { contains: term, mode: 'insensitive' } } },
      {
        chart: {
          simfiles: {
            some: {
              simfile: {
                OR: [{ title: { contains: term, mode: 'insensitive' } }, { artist: { contains: term, mode: 'insensitive' } }],
              },
            },
          },
        },
      },
    ];
  }

  let filterLeaderboardId: number | undefined;
  if (opts.leaderboard) {
    // Resolve provided leaderboard type string to an ID for filtering
    const row = await prisma.leaderboard.findFirst({ where: { type: opts.leaderboard }, select: { id: true } });
    filterLeaderboardId = row?.id;
    where.PlayLeaderboard = {
      some: {
        leaderboardId: filterLeaderboardId ?? -1, // -1 ensures no results if unknown
      },
    };
  }

  if (opts.minMeter !== undefined || opts.maxMeter !== undefined) {
    where.chart = where.chart || {};
    const range: any = {};
    if (opts.minMeter !== undefined) range.gte = opts.minMeter;
    if (opts.maxMeter !== undefined) range.lte = opts.maxMeter;

    // When includeUnknown is true (default), include charts where meter is null as well
    if (opts.includeUnknown !== false) {
      // Prisma: filter by chart OR condition: meter in range OR meter is null
      (where.chart as any).OR = [{ meter: range }, { meter: null }];
    } else {
      (where.chart as any).meter = range;
    }
  }

  const skipVal = (opts.page - 1) * opts.limit;
  const useSkip = skipVal > 0 ? skipVal : undefined;

  let plays: any[];

  // Helper to build common SQL WHERE conditions
  const buildWhereConditions = (baseCondition: Prisma.Sql): Prisma.Sql[] => {
    const sqlParts: Prisma.Sql[] = [baseCondition];

    // Add search condition
    if (opts.search) {
      const searchPattern = `%${opts.search}%`;
      sqlParts.push(Prisma.sql`
        AND (
          c."songName" ILIKE ${searchPattern} OR 
          c."artist" ILIKE ${searchPattern} OR
          s."title" ILIKE ${searchPattern} OR 
          s."artist" ILIKE ${searchPattern}
        )
      `);
    }

    // Add leaderboard filter
    if (opts.leaderboard && filterLeaderboardId !== undefined) {
      sqlParts.push(Prisma.sql`
        AND EXISTS (
          SELECT 1 FROM "PlayLeaderboard" pl 
          WHERE pl."playId" = p.id AND pl."leaderboardId" = ${filterLeaderboardId}
        )
      `);
    }

    // Add meter filter
    if (opts.minMeter !== undefined || opts.maxMeter !== undefined) {
      if (opts.includeUnknown !== false) {
        const meterParts: Prisma.Sql[] = [];
        if (opts.minMeter !== undefined && opts.maxMeter !== undefined) {
          meterParts.push(Prisma.sql`c."meter" BETWEEN ${opts.minMeter} AND ${opts.maxMeter}`);
        } else if (opts.minMeter !== undefined) {
          meterParts.push(Prisma.sql`c."meter" >= ${opts.minMeter}`);
        } else if (opts.maxMeter !== undefined) {
          meterParts.push(Prisma.sql`c."meter" <= ${opts.maxMeter}`);
        }
        meterParts.push(Prisma.sql`c."meter" IS NULL`);
        sqlParts.push(Prisma.sql`AND (`);
        sqlParts.push(Prisma.join(meterParts, ' OR '));
        sqlParts.push(Prisma.sql`)`);
      } else {
        if (opts.minMeter !== undefined && opts.maxMeter !== undefined) {
          sqlParts.push(Prisma.sql`AND c."meter" BETWEEN ${opts.minMeter} AND ${opts.maxMeter}`);
        } else if (opts.minMeter !== undefined) {
          sqlParts.push(Prisma.sql`AND c."meter" >= ${opts.minMeter}`);
        } else if (opts.maxMeter !== undefined) {
          sqlParts.push(Prisma.sql`AND c."meter" <= ${opts.maxMeter}`);
        }
      }
    }

    return sqlParts;
  };

  // For score sorting, we need to use raw SQL
  if (opts.orderBy === 'score') {
    const orderDir = opts.orderDirection.toUpperCase() as 'ASC' | 'DESC';

    // Score sorting - use sortKey from PlayLeaderboard for the selected leaderboard
    if (!opts.leaderboard || filterLeaderboardId === undefined) {
      throw new Error('Score sorting requires a leaderboard to be selected');
    }

    // Use ROW_NUMBER to get only the best score per play for the leaderboard
    const innerQuery = Prisma.sql`
      SELECT 
        p.id,
        p."createdAt",
        p."chartHash",
        pl."sortKey",
        ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY pl."sortKey" DESC) as rn
      FROM "Play" p
      INNER JOIN "Chart" c ON p."chartHash" = c.hash
      INNER JOIN "PlayLeaderboard" pl ON pl."playId" = p.id AND pl."leaderboardId" = ${filterLeaderboardId}
      LEFT JOIN "SimfileChart" sc ON sc."chartHash" = c.hash
      LEFT JOIN "Simfile" s ON sc."simfileId" = s.id
      WHERE p."userId" = ${userId}
    `;

    // Build the WHERE conditions for the inner query
    const innerSqlParts = buildWhereConditions(innerQuery);

    // Wrap in outer query to filter rn = 1 and apply ordering
    const sqlParts = [Prisma.sql`SELECT * FROM (`];
    sqlParts.push(Prisma.join(innerSqlParts, ''));
    sqlParts.push(Prisma.sql`) subq WHERE rn = 1`);

    // Add ordering and pagination by sortKey (higher sortKey = better score)
    if (orderDir === 'ASC') {
      sqlParts.push(Prisma.sql`
        ORDER BY "sortKey" ASC, "createdAt" DESC
        LIMIT ${opts.limit} OFFSET ${useSkip || 0}
      `);
    } else {
      sqlParts.push(Prisma.sql`
        ORDER BY "sortKey" DESC, "createdAt" DESC
        LIMIT ${opts.limit} OFFSET ${useSkip || 0}
      `);
    }

    const finalQuery = Prisma.join(sqlParts, '');
    const rawPlays = await prisma.$queryRaw<{ id: number; createdAt: Date; chartHash: string }[]>(finalQuery);

    // Now fetch full data for these play IDs using Prisma
    const playIds = rawPlays.map((p: any) => p.id);
    if (playIds.length === 0) {
      plays = [];
    } else {
      const fullPlays = await prisma.play.findMany({
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
            where: opts.leaderboard ? { leaderboardId: filterLeaderboardId ?? -1 } : undefined,
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
                orderBy: { createdAt: 'asc' },
                select: {
                  createdAt: true,
                  chartName: true,
                  stepsType: true,
                  description: true,
                  meter: true,
                  credit: true,
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
        where: { id: { in: playIds } },
      });

      // Re-order according to the SQL sort order
      const playMap = new Map(fullPlays.map((p) => [p.id, p]));
      plays = playIds.map((id) => playMap.get(id)).filter(Boolean) as any[];
    }
  } else {
    // Date sorting - use the original Prisma query
    const orderBy = { createdAt: opts.orderDirection };

    plays = await prisma.play.findMany({
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
          where: opts.leaderboard ? { leaderboardId: filterLeaderboardId ?? -1 } : undefined,
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
              orderBy: { createdAt: 'asc' },
              select: {
                createdAt: true,
                chartName: true,
                stepsType: true,
                description: true,
                meter: true,
                credit: true,
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
      where,
      orderBy,
      ...(useSkip !== undefined ? { skip: useSkip } : {}),
      take: opts.limit,
    });
  }

  // Count is optional in tests; if unavailable, fall back to plays.length
  let totalCount: number = plays.length;
  const maybeCount = (prisma as any)?.play?.count;
  if (typeof maybeCount === 'function') {
    try {
      totalCount = await maybeCount({ where });
    } catch {
      // ignore count failures in favor of data; metadata will be approximate
      totalCount = plays.length;
    }
  }

  return { plays, totalCount };
};

export const getUserById = async (event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.routeParameters?.userId) {
      return respond(400, { error: 'User ID is required' });
    }

    const userId = event.routeParameters.userId;

    // Parse query params for recent plays options (non-breaking defaults)
    const queryParams = event.queryStringParameters || {};
    let page = 1,
      limit = 10,
      search: string | undefined,
      leaderboard: string | undefined,
      minMeter: number | undefined,
      maxMeter: number | undefined,
      orderBy: 'date' | 'score' = 'date',
      orderDirection: 'asc' | 'desc' = 'desc';
    try {
      const parsed = ListUserRecentPlaysQuerySchema.parse(queryParams);
      page = parsed.page;
      limit = parsed.limit;
      search = parsed.search;
      leaderboard = parsed.leaderboard;
      minMeter = parsed.minMeter;
      maxMeter = parsed.maxMeter;
      orderBy = parsed.orderBy;
      orderDirection = parsed.orderDirection;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // If invalid, fall back to defaults; do not error to remain backward compatible
    }

    const [user, preferredIds] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          alias: true,
          profileImageUrl: true,
          banned: true,
          countryId: true,
          country: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          stats: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      getUserPreferredLeaderboardIds(prisma, userId),
    ]);

    const [{ plays: recentPlays, totalCount }, blueShiftData, trophies] = await Promise.all([
      getRecentPlaysForUser(userId, prisma, {
        page,
        limit,
        search,
        leaderboard,
        minMeter,
        maxMeter,
        includeUnknown: (queryParams as any)?.includeUnknown !== undefined ? String((queryParams as any).includeUnknown).toLowerCase() !== 'false' : true,
        orderBy,
        orderDirection,
      }),
      fetchBlueShiftUserData(userId),
      // Fetch trophies for user profile display
      getUserTrophies(prisma, userId, 8),
    ]);

    if (!user) {
      return respond(404, { error: 'User not found' });
    }

    // Check if user is banned - treat as user not found
    if (user.banned) {
      return respond(404, { error: 'User not found' });
    }

    const response = {
      user: {
        ...user,
        profileImageUrl: user.profileImageUrl ? assetS3UrlToCloudFrontUrl(user.profileImageUrl) : null,
        blueShift: blueShiftData,
        trophies,
        preferredLeaderboards: preferredIds, // client decides default subset if empty
        recentPlays: recentPlays.map((recentPlay) => {
          const chartBanner = resolveChartBanner(recentPlay.chart.simfiles);
          const primarySimfile = recentPlay.chart.simfiles[0]?.simfile;

          return {
            playId: recentPlay.id,
            chart: {
              hash: recentPlay.chart.hash,
              ...chartBanner,
              title: primarySimfile?.title || recentPlay.chart.songName,
              artist: primarySimfile?.artist || recentPlay.chart.artist,
              stepsType: recentPlay.chart.stepsType,
              difficulty: recentPlay.chart.difficulty,
              meter: recentPlay.chart.meter,
            },
            leaderboards: recentPlay.PlayLeaderboard.map((playLeaderboard: any) => ({
              leaderboard: playLeaderboard.leaderboard.type,
              data: playLeaderboard.data,
            })),
            createdAt: recentPlay.createdAt,
          };
        }),
      },
      // Non-breaking addition: pagination metadata for recent plays
      recentPlaysMeta: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPreviousPage: page > 1,
        orderBy,
        orderDirection,
        ...(search ? { search } : {}),
        ...(leaderboard ? { leaderboard } : {}),
        ...(minMeter !== undefined ? { minMeter } : {}),
        ...(maxMeter !== undefined ? { maxMeter } : {}),
        includeUnknown: (queryParams as any)?.includeUnknown !== undefined ? String((queryParams as any).includeUnknown).toLowerCase() !== 'false' : true,
      },
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return internalServerErrorResponse();
  }
};

export const updateProfile = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }

    let requestBody: unknown;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    // Validate request using Zod
    const validationResult = UpdateProfileRequestSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return respond(422, { error: 'Validation failed', issues: validationResult.error.issues });
    }

    const { alias, countryId, timezone, currentPassword, newPassword } = validationResult.data;

    // Get current user data
    const currentUser = await prisma.user.findUnique({
      where: { id: event.user.id },
    });

    if (!currentUser) {
      return respond(404, { error: 'User not found' });
    }

    // Check if alias already exists (if being updated)
    if (alias && alias !== currentUser.alias) {
      const existingUser = await prisma.user.findUnique({
        where: { alias },
      });

      if (existingUser) {
        return respond(409, { error: 'Alias already exists' });
      }
    }

    // Validate country exists if provided
    if (countryId) {
      const country = await prisma.country.findUnique({
        where: { id: countryId },
      });

      if (!country) {
        return respond(400, { error: 'Invalid country selected' });
      }
    }

    // Password validation if changing password
    let passwordHash: string | undefined;
    let passwordSalt: string | undefined;

    if (newPassword) {
      // Verify current password
      if (!currentUser.passwordHash || !currentUser.passwordSalt) {
        return respond(400, { error: 'No current password set' });
      }

      if (!currentPassword) {
        return respond(400, { error: 'Current password is required' });
      }

      const isValidPassword = verifyPassword(currentPassword, currentUser.passwordSalt, currentUser.passwordHash);

      if (!isValidPassword) {
        return respond(400, { error: 'Current password is incorrect' });
      }

      // Generate new password hash
      passwordSalt = generateSalt();
      passwordHash = hashPassword(newPassword, passwordSalt);
    }

    // Update user profile
    const updateData: any = {};
    if (alias) {
      updateData.alias = alias;
    }
    if (countryId !== undefined) {
      updateData.countryId = countryId;
    }
    if (timezone !== undefined) {
      updateData.timezone = timezone;
    }
    if (passwordHash && passwordSalt) {
      updateData.passwordHash = passwordHash;
      updateData.passwordSalt = passwordSalt;
    }

    const updatedUser = await prisma.user.update({
      where: { id: event.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        alias: true,
        profileImageUrl: true,
        timezone: true,
        emailVerifiedAt: true,
        countryId: true,
        country: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    // If alias changed, notify Discord
    if (alias && alias !== currentUser.alias) {
      try {
        const baseUrl = process.env.FRONTEND_URL || 'https://arrowcloud.dance';
        const profileUrl = `${baseUrl}/user/${updatedUser.id}`;
        await publishDiscordMessage({
          type: 'user-event',
          embeds: [
            {
              title: 'User alias changed',
              description: `~~${currentUser.alias}~~ → [${updatedUser.alias}](${profileUrl})`,
              color: 0xfee75c, // yellow
              fields: [
                { name: 'Old', value: currentUser.alias, inline: true },
                { name: 'New', value: updatedUser.alias, inline: true },
              ],
            },
          ],
        });
      } catch (e) {
        console.warn('Failed to publish Discord alias-change notification', e);
      }
    }

    return respond(200, {
      user: {
        ...updatedUser,
        profileImageUrl: updatedUser.profileImageUrl ? assetS3UrlToCloudFrontUrl(updatedUser.profileImageUrl) : null,
      },
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return internalServerErrorResponse();
  }
};

export const updateUserPreferredLeaderboards = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return respond(400, { error: 'Request body is required' });
    }
    let requestBody: unknown;
    try {
      requestBody = JSON.parse(event.body);
    } catch {
      return respond(400, { error: 'Invalid JSON' });
    }
    const parsed = UpdatePreferredLeaderboardsSchema.safeParse(requestBody);
    if (!parsed.success) {
      return respond(422, { error: 'Validation failed', issues: parsed.error.issues });
    }
    const leaderboardIds = parsed.data.leaderboardIds;
    const updated = await setUserPreferredLeaderboards(prisma, event.user.id, leaderboardIds);

    // Fetch current user (same shape as getUser) so client can update without extra roundtrip
    const user = await prisma.user.findUnique({
      where: { id: event.user.id },
      select: {
        id: true,
        email: true,
        alias: true,
        profileImageUrl: true,
        emailVerifiedAt: true,
        countryId: true,
        country: {
          select: { id: true, name: true, code: true },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return respond(404, { error: 'User not found' });
    }

    return respond(200, {
      user: {
        ...user,
        profileImageUrl: user.profileImageUrl ? assetS3UrlToCloudFrontUrl(user.profileImageUrl) : null,
        preferredLeaderboards: updated,
      },
    });
  } catch (err) {
    console.error('Error updating preferred leaderboards', err);
    return internalServerErrorResponse();
  }
};

const BanUserRequestSchema = z.object({
  reason: z.string().optional().default('Violation of terms of service'),
  deleteData: z.boolean().optional().default(true),
});

async function sendSuspensionEmail(email: string, alias: string): Promise<void> {
  const fromEmail = process.env.FROM_EMAIL_ADDRESS || 'noreply@arrowcloud.dance';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Account Suspended - Arrow Cloud</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc3545; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            .reason { background: #fff; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Account Suspended</h1>
            </div>
            <div class="content">
                <p>Dear <strong>${alias}</strong>,</p>
                
                <p>Your Arrow Cloud account has been suspended.</p>

                <p>This action is permanent and cannot be reversed. You cannot appeal or register a new account.</p>
                
                <p>Regards,<br><strong>The Arrow Cloud Team</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message, please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
  `;

  const textContent = `
Account Suspended

Dear ${alias},

Your Arrow Cloud account has been suspended.

This action is permanent and cannot be reversed. You cannot appeal or register a new account.

Regards,
The Arrow Cloud Team

This is an automated message, please do not reply to this email.
  `;

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: 'Account Suspended - Arrow Cloud',
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: htmlContent,
          Charset: 'UTF-8',
        },
        Text: {
          Data: textContent,
          Charset: 'UTF-8',
        },
      },
    },
  });

  await sesClient.send(command);
}

export const banUser = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.routeParameters?.userId) {
      return respond(400, { error: 'User ID is required' });
    }

    const userId = event.routeParameters.userId;

    // Parse and validate request body
    let requestBody: unknown;
    try {
      requestBody = event.body ? JSON.parse(event.body) : {};
    } catch {
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    const validationResult = BanUserRequestSchema.safeParse(requestBody);
    if (!validationResult.success) {
      return respond(422, {
        error: 'Validation failed',
        issues: validationResult.error.issues,
      });
    }

    const { reason, deleteData } = validationResult.data;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        alias: true,
        banned: true,
      },
    });

    if (!user) {
      return respond(404, { error: 'User not found' });
    }

    if (user.banned) {
      return respond(400, { error: 'User is already banned' });
    }

    if (deleteData) {
      // Delete user data in correct order to respect foreign key constraints
      await Promise.all([
        prisma.apiKey.deleteMany({ where: { userId } }),
        prisma.passkey.deleteMany({ where: { userId } }),
        prisma.userPreferredLeaderboard.deleteMany({ where: { userId } }),
        prisma.userRival.deleteMany({ where: { userId } }),
        prisma.userRival.deleteMany({ where: { rivalUserId: userId } }),
        prisma.userRole.deleteMany({ where: { userId } }),
        prisma.userPermission.deleteMany({ where: { userId } }),
        prisma.play.deleteMany({ where: { userId } }),
        prisma.eventRegistration.deleteMany({ where: { userId } }),
      ]);
    }

    // Ban the user
    await prisma.user.update({
      where: { id: userId },
      data: {
        banned: true,
        shadowBanned: false,
      },
    });

    // Send Discord notification
    try {
      const baseUrl = process.env.FRONTEND_URL || 'https://arrowcloud.dance';
      const profileUrl = `${baseUrl}/user/${user.id}`;
      await publishDiscordMessage({
        type: 'admin-event',
        embeds: [
          {
            title: 'User banned',
            description: `[${user.alias}](${profileUrl}) has been banned`,
            color: 0xed4245, // red
            fields: [
              { name: 'Data Deleted', value: deleteData ? 'Yes' : 'No', inline: true },
              { name: 'Admin', value: event.user?.alias || 'System', inline: true },
            ],
          },
        ],
      });
    } catch (discordError) {
      console.warn('Failed to send Discord notification:', discordError);
      // Don't fail the entire operation if Discord notification fails
    }

    // Send suspension notification email
    try {
      await sendSuspensionEmail(user.email, user.alias);
    } catch (emailError) {
      console.warn('Failed to send suspension notification email:', emailError);
      // Don't fail the entire operation if email fails
    }

    return respond(200, {
      message: `User ${user.alias} has been banned successfully`,
      user: {
        id: user.id,
        alias: user.alias,
        email: user.email,
      },
      reason,
      dataDeleted: deleteData,
    });
  } catch (error) {
    console.error('Error banning user:', error);
    return internalServerErrorResponse();
  }
};

/**
 * Get all trophies for the current authenticated user
 * Returns all trophies (not limited to 8) for management purposes
 */
export const getUserTrophiesHandler = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.user!.id;

    // Get all trophies (pass a high limit to get all)
    const trophies = await getUserTrophies(prisma, userId, 1000);

    return respond(200, { trophies });
  } catch (error) {
    console.error('Error fetching user trophies:', error);
    return internalServerErrorResponse();
  }
};

/**
 * Update the display order for a user's trophies
 */
const UpdateTrophyOrderSchema = z.object({
  trophyOrders: z.array(
    z.object({
      trophyId: z.number(),
      displayOrder: z.number().nullable(),
    }),
  ),
});

export const updateUserTrophyOrder = async (event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.user!.id;

    let body: unknown;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respond(400, { error: 'Invalid JSON body' });
    }

    const parsed = UpdateTrophyOrderSchema.safeParse(body);
    if (!parsed.success) {
      return respond(400, { error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { trophyOrders } = parsed.data;

    await updateTrophyDisplayOrder(prisma, userId, trophyOrders);

    // Return updated trophies
    const trophies = await getUserTrophies(prisma, userId, 1000);

    return respond(200, { trophies });
  } catch (error) {
    console.error('Error updating trophy order:', error);
    return internalServerErrorResponse();
  }
};
