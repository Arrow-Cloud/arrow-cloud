import { APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { AuthenticatedEvent } from '../utils/types';
import { internalServerErrorResponse, respond } from '../utils/responses';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export async function listNotifications(event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const params = event.queryStringParameters || {};
    const cursor = params.cursor ? parseInt(params.cursor, 10) : undefined;
    const limit = Math.min(Math.max(parseInt(params.limit || '', 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const notifications = await prisma.notification.findMany({
      where: { userId: event.user.id },
      orderBy: { id: 'desc' },
      take: limit + 1, // Fetch one extra to determine if there's a next page
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        data: true,
        readAt: true,
        createdAt: true,
      },
    });

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return respond(200, { notifications: items, nextCursor });
  } catch (err) {
    console.error('Error listing notifications', err);
    return internalServerErrorResponse();
  }
}

export async function markRead(event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    const notificationId = parseInt(event.routeParameters?.notificationId || '', 10);
    if (isNaN(notificationId)) {
      return respond(400, { error: 'Invalid notification ID' });
    }

    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId: event.user.id },
    });

    if (!notification) {
      return respond(404, { error: 'Notification not found' });
    }

    if (!notification.readAt) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { readAt: new Date() },
      });
    }

    return respond(200, { success: true });
  } catch (err) {
    console.error('Error marking notification as read', err);
    return internalServerErrorResponse();
  }
}

export async function markAllRead(event: AuthenticatedEvent, prisma: PrismaClient): Promise<APIGatewayProxyResult> {
  try {
    await prisma.notification.updateMany({
      where: { userId: event.user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return respond(200, { success: true });
  } catch (err) {
    console.error('Error marking all notifications as read', err);
    return internalServerErrorResponse();
  }
}
