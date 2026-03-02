import { listRivals, addRival, deleteRival, autocompleteUsers } from '../../src/controllers/rivals';
import { AuthenticatedEvent } from '../../src/utils/types';
import { PrismaClient } from '../../prisma/generated';

// Mock Prisma subset we use
const mockPrisma = {
  userRival: {
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
} as unknown as PrismaClient;

const baseEvent = (overrides: Partial<AuthenticatedEvent>): AuthenticatedEvent => ({
  path: '/rivals',
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

describe('Rivals Controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listRivals', () => {
    it('returns empty list', async () => {
      mockPrisma.userRival.findMany = jest.fn().mockResolvedValue([]);
      const res = await listRivals(baseEvent({}), mockPrisma);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ rivals: [] });
    });
  });

  describe('addRival', () => {
    it('adds by userId', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'user-2', alias: 'target', profileImageUrl: null });
      mockPrisma.userRival.create = jest.fn().mockResolvedValue({ userId: 'user-1', rivalUserId: 'user-2' });
      const res = await addRival(
        baseEvent({ httpMethod: 'POST', body: JSON.stringify({ rivalUserId: 'user-2' }) }),
        mockPrisma,
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.rival.userId).toBe('user-2');
    });

    it('rejects self rival', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'user-1', alias: 'me', profileImageUrl: null });
      const res = await addRival(
        baseEvent({ httpMethod: 'POST', body: JSON.stringify({ rivalUserId: 'user-1' }) }),
        mockPrisma,
      );
      expect(res.statusCode).toBe(400);
    });

    it('404 when target not found', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(null);
      const res = await addRival(
        baseEvent({ httpMethod: 'POST', body: JSON.stringify({ rivalUserId: 'missing' }) }),
        mockPrisma,
      );
      expect(res.statusCode).toBe(404);
    });
  });

  describe('deleteRival', () => {
    it('returns 204 even if not found', async () => {
      mockPrisma.userRival.delete = jest.fn().mockRejectedValue(new Error('NotFoundError'));
      const res = await deleteRival(
        baseEvent({ httpMethod: 'DELETE', path: '/rival/user-2', routeParameters: { userId: 'user-2' } }),
        mockPrisma,
      );
      expect(res.statusCode).toBe(204);
    });
  });

  describe('autocompleteUsers', () => {
    it('requires min length', async () => {
      const res = await autocompleteUsers(
        baseEvent({ path: '/users/autocomplete', queryStringParameters: { query: 'a' } as any }),
        mockPrisma,
      );
      expect(res.statusCode).toBe(400);
    });

    it('filters rivals and limits', async () => {
      mockPrisma.userRival.findMany = jest.fn().mockResolvedValue([{ rivalUserId: 'user-2' }]);
      mockPrisma.user.findMany = jest.fn().mockResolvedValue([
        { id: 'user-2', alias: 'zzz', profileImageUrl: null },
        { id: 'user-3', alias: 'aaa', profileImageUrl: null },
      ]);
      const res = await autocompleteUsers(
        baseEvent({ path: '/users/autocomplete', queryStringParameters: { query: 'a' } as any, }),
        mockPrisma,
      );
      // First call with length 1 will 400, adjust to length 2
      const res2 = await autocompleteUsers(
        baseEvent({ path: '/users/autocomplete', queryStringParameters: { query: 'aa' } as any, }),
        mockPrisma,
      );
      expect(res2.statusCode).toBe(200);
      const body = JSON.parse(res2.body);
      expect(body.users.length).toBe(1);
      expect(body.users[0].userId).toBe('user-3');
    });
  });
});
