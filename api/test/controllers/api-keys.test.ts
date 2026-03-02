import { listApiKeys, createApiKey, deleteApiKey } from '../../src/controllers/api-keys';
import { AuthenticatedEvent } from '../../src/utils/types';
import { PrismaClient } from '../../prisma/generated/client';

jest.mock('../../src/utils/auth', () => ({
  generateApiKey: jest.fn(() => 'plaintext-key'),
  hashApiKey: jest.fn((k: string) => 'hash-' + k),
}));

const mockPrisma = {
  apiKey: {
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
  },
} as unknown as PrismaClient;

const baseEvent = (overrides: Partial<AuthenticatedEvent> = {}): AuthenticatedEvent => ({
  path: '/api-keys',
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

describe('API Keys Controllers', () => {
  beforeEach(() => jest.clearAllMocks());

  test('listApiKeys returns empty array', async () => {
    (mockPrisma.apiKey.findMany as any).mockResolvedValue([]);
    const res = await listApiKeys(baseEvent(), mockPrisma);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ apiKeys: [] });
  });

  test('createApiKey returns plaintext once and stored record', async () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    (mockPrisma.apiKey.create as any).mockResolvedValue({ keyHash: 'hash-plaintext-key', userId: 'user-1', createdAt, lastUsedAt: null });
    const res = await createApiKey(baseEvent({ httpMethod: 'POST' }), mockPrisma);
    expect(res.statusCode).toBe(201);
    const b = JSON.parse(res.body);
    expect(b.key).toBe('plaintext-key');
    expect(b.apiKey.id).toBe('hash-plaintext-key');
    expect(b.apiKey.createdAt).toBe(createdAt.toISOString());
    expect(b.apiKey.lastUsedAt).toBeNull();
  });

  test('deleteApiKey requires keyId', async () => {
    const res = await deleteApiKey(baseEvent({ httpMethod: 'DELETE' }), mockPrisma);
    expect(res.statusCode).toBe(400);
  });

  test('deleteApiKey 404 when not found', async () => {
    (mockPrisma.apiKey.findFirst as any).mockResolvedValue(null);
    const res = await deleteApiKey(baseEvent({ httpMethod: 'DELETE', routeParameters: { keyId: 'abc' } }), mockPrisma);
    expect(res.statusCode).toBe(404);
  });

  test('deleteApiKey success', async () => {
    (mockPrisma.apiKey.findFirst as any).mockResolvedValue({ keyHash: 'abc', userId: 'user-1' });
    (mockPrisma.apiKey.delete as any).mockResolvedValue({});
    const res = await deleteApiKey(baseEvent({ httpMethod: 'DELETE', routeParameters: { keyId: 'abc' } }), mockPrisma);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ message: 'API key deleted successfully' });
  });
});
