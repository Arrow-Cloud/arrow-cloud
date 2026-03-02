import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { AuthenticatedEvent, ExtendedAPIGatewayProxyEvent } from '../utils/types';
import { emptyResponse, internalServerErrorResponse, respond } from '../utils/responses';

// List current user's rivals
export async function listRivals(event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const rows = await prisma.userRival.findMany({
      where: {
        userId: event.user.id,
        rival: {
          banned: false, // Only include non-banned rivals
        },
      },
      include: {
        rival: {
          select: { id: true, alias: true, profileImageUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const rivals = rows.map((r) => ({
      userId: r.rival.id,
      alias: r.rival.alias,
      profileImageUrl: r.rival.profileImageUrl || null,
      createdAt: r.createdAt,
    }));
    return respond(200, { rivals });
  } catch (err) {
    console.error('Error listing rivals', err);
    return internalServerErrorResponse();
  }
}

interface AddRivalBody {
  rivalUserId?: string;
  rivalAlias?: string;
}

// Add a rival for the current user (idempotent if already exists)
export async function addRival(event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    let body: AddRivalBody | undefined;
    try {
      body = event.body ? (JSON.parse(event.body) as AddRivalBody) : undefined;
    } catch {
      return respond(400, { error: 'Invalid JSON body' });
    }
    if (!body) return respond(400, { error: 'Invalid JSON body' });

    const targetUserId = body.rivalUserId?.trim();
    const rivalAlias = body.rivalAlias?.trim();

    if (!targetUserId && !rivalAlias) {
      return respond(400, { error: 'rivalUserId or rivalAlias is required' });
    }

    // If both provided, prefer userId; alias remains unused.

    let targetUser = null;
    if (targetUserId) {
      targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, alias: true, profileImageUrl: true, banned: true } });
    } else if (rivalAlias) {
      targetUser = await prisma.user.findUnique({ where: { alias: rivalAlias }, select: { id: true, alias: true, profileImageUrl: true, banned: true } });
    }

    if (!targetUser || targetUser.banned) {
      return respond(404, { error: 'Target user not found' });
    }

    if (targetUser.id === event.user.id) {
      return respond(400, { error: 'Cannot rival yourself' });
    }

    try {
      await prisma.userRival.create({
        data: { userId: event.user.id, rivalUserId: targetUser.id },
      });
    } catch (createErr: any) {
      // Unique constraint -> already exists: treat as idempotent success
      const message = createErr?.message || '';
      if (!/Unique constraint/i.test(message) && !/duplicate key/i.test(message)) {
        console.error('Error creating rival', createErr);
        return internalServerErrorResponse();
      }
    }

    return respond(200, {
      rival: {
        userId: targetUser.id,
        alias: targetUser.alias,
        profileImageUrl: targetUser.profileImageUrl || null,
      },
    });
  } catch (err) {
    console.error('Error adding rival', err);
    return internalServerErrorResponse();
  }
}

// Remove a rival (idempotent if missing)
export async function deleteRival(event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const routeUserId = event.routeParameters?.userId;
    if (!routeUserId) {
      return respond(400, { error: 'userId route parameter required' });
    }

    try {
      await prisma.userRival.delete({
        where: { userId_rivalUserId: { userId: event.user.id, rivalUserId: routeUserId } },
      });
    } catch {
      // Not found: Prisma throws NotFoundError; ignore for idempotency
    }
    return emptyResponse(204);
  } catch (err) {
    console.error('Error deleting rival', err);
    return internalServerErrorResponse();
  }
}

// Autocomplete users by alias (excludes self and existing rivals)
export async function autocompleteUsers(event: AuthenticatedEvent | ExtendedAPIGatewayProxyEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const q = event.queryStringParameters?.query?.trim() || '';
    if (q.length < 2) {
      return respond(400, { error: 'query must be at least 2 characters' });
    }

    // Collect already rivaled ids to exclude
    const existing = await prisma.userRival.findMany({
      where: { userId: (event as AuthenticatedEvent).user.id },
      select: { rivalUserId: true },
    });
    const excludeIds = new Set(existing.map((r) => r.rivalUserId));

    const users = await prisma.user.findMany({
      where: {
        alias: { contains: q, mode: 'insensitive' },
        NOT: { id: (event as AuthenticatedEvent).user.id },
        banned: false, // Exclude banned users from autocomplete
      },
      take: 15, // fetch a little extra pre-filter, we'll trim to 10 after excluding rivals
      select: { id: true, alias: true, profileImageUrl: true },
      orderBy: { alias: 'asc' },
    });

    const filtered = users.filter((u) => !excludeIds.has(u.id)).slice(0, 10);

    return respond(200, { users: filtered.map((u) => ({ userId: u.id, alias: u.alias, profileImageUrl: u.profileImageUrl || null })) });
  } catch (err) {
    console.error('Error in autocomplete', err);
    return internalServerErrorResponse();
  }
}
