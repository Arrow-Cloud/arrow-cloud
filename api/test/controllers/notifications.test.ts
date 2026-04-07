import { listNotifications, markRead, markAllRead } from '../../src/controllers/notifications';
import { AuthenticatedEvent } from '../../src/utils/types';
import { PrismaClient } from '../../prisma/generated';

const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
} as unknown as PrismaClient;

const baseEvent = (overrides: Partial<AuthenticatedEvent> = {}): AuthenticatedEvent => ({
  path: '/notifications',
  httpMethod: 'GET',
  headers: {},
  multiValueHeaders: {},
  queryStringParameters: null as any,
  multiValueQueryStringParameters: null as any,
  pathParameters: null as any,
  stageVariables: null as any,
  requestContext: {} as any,
  resource: '',
  isBase64Encoded: false,
  body: null,
  user: { id: 'user-1' } as any,
  routeParameters: {},
  ...overrides,
});

describe('Notifications Controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listNotifications', () => {
    it('returns empty list', async () => {
      mockPrisma.notification.findMany = jest.fn().mockResolvedValue([]);
      const res = await listNotifications(baseEvent(), mockPrisma);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.notifications).toEqual([]);
      expect(body.nextCursor).toBeNull();
    });

    it('returns notifications with pagination', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({
        id: 21 - i,
        type: 'test',
        title: `Notification ${21 - i}`,
        body: null,
        data: null,
        readAt: null,
        createdAt: new Date(),
      }));
      mockPrisma.notification.findMany = jest.fn().mockResolvedValue(items);
      const res = await listNotifications(baseEvent(), mockPrisma);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.notifications).toHaveLength(20);
      expect(body.nextCursor).toBe(2); // Last item of first page
    });

    it('passes cursor to prisma', async () => {
      mockPrisma.notification.findMany = jest.fn().mockResolvedValue([]);
      await listNotifications(baseEvent({ queryStringParameters: { cursor: '10' } as any }), mockPrisma);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 10 },
          skip: 1,
        }),
      );
    });

    it('caps limit at 50', async () => {
      mockPrisma.notification.findMany = jest.fn().mockResolvedValue([]);
      await listNotifications(baseEvent({ queryStringParameters: { limit: '200' } as any }), mockPrisma);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 51, // MAX_PAGE_SIZE + 1
        }),
      );
    });
  });

  describe('markRead', () => {
    it('marks a notification as read', async () => {
      mockPrisma.notification.findFirst = jest.fn().mockResolvedValue({
        id: 5,
        userId: 'user-1',
        readAt: null,
      });
      mockPrisma.notification.update = jest.fn().mockResolvedValue({});
      const res = await markRead(baseEvent({ routeParameters: { notificationId: '5' } }), mockPrisma);
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5 },
          data: { readAt: expect.any(Date) },
        }),
      );
    });

    it('is a no-op if already read', async () => {
      mockPrisma.notification.findFirst = jest.fn().mockResolvedValue({
        id: 5,
        userId: 'user-1',
        readAt: new Date(),
      });
      const res = await markRead(baseEvent({ routeParameters: { notificationId: '5' } }), mockPrisma);
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.notification.update).not.toHaveBeenCalled();
    });

    it('returns 404 for wrong user', async () => {
      mockPrisma.notification.findFirst = jest.fn().mockResolvedValue(null);
      const res = await markRead(baseEvent({ routeParameters: { notificationId: '5' } }), mockPrisma);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid id', async () => {
      const res = await markRead(baseEvent({ routeParameters: { notificationId: 'abc' } }), mockPrisma);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('markAllRead', () => {
    it('marks all unread notifications as read', async () => {
      mockPrisma.notification.updateMany = jest.fn().mockResolvedValue({ count: 3 });
      const res = await markAllRead(baseEvent(), mockPrisma);
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
