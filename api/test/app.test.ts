import { APIGatewayProxyResult } from 'aws-lambda';
import { handler } from '../src/app';

// Mock p-limit
jest.mock('p-limit', () => {
  return jest.fn(() => (fn: any) => fn());
});

// Mock the secrets utility
jest.mock('../src/utils/secrets', () => ({
  getDatabaseUrl: jest.fn().mockResolvedValue('postgresql://user:pass@localhost:5432/test'),
  getJwtSecret: jest.fn().mockResolvedValue('test-jwt-secret'),
}));

jest.mock('../src/controllers/health', () => ({
  healthCheck: jest.fn(),
  authCheck: jest.fn(),
  postCheck: jest.fn(),
}));

jest.mock('../src/controllers/chart', () => ({
  scoreSubmission: jest.fn(),
}));

jest.mock('../src/utils/middleware', () => ({
  composeMiddleware: jest.fn(),
}));

jest.mock('../prisma/generated/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { healthCheck, authCheck } from '../src/controllers/health';
import { composeMiddleware } from '../src/utils/middleware';
import { ExtendedAPIGatewayProxyEvent } from '../src/utils/types';

const mockHealthCheck = healthCheck as jest.MockedFunction<typeof healthCheck>;
const mockAuthCheck = authCheck as jest.MockedFunction<typeof authCheck>;
const mockComposeMiddleware = composeMiddleware as jest.MockedFunction<typeof composeMiddleware>;

describe('API Gateway Lambda Handler', () => {
  let mockEvent: ExtendedAPIGatewayProxyEvent;
  let mockComposedHandler: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockComposedHandler = jest.fn();
    mockComposeMiddleware.mockReturnValue(mockComposedHandler);

    mockEvent = {
      path: '/',
      httpMethod: 'GET',
      headers: {},
      multiValueHeaders: {},
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      body: null,
      isBase64Encoded: false,
      routeParameters: {},
    };
  });

  describe('Route Matching', () => {
    it('should handle static routes', async () => {
      const expectedResponse: APIGatewayProxyResult = {
        statusCode: 200,
        body: JSON.stringify({ message: 'OK' }),
      };

      mockComposedHandler.mockResolvedValue(expectedResponse);

      const result = await handler(mockEvent);

      expect(mockComposeMiddleware).toHaveBeenCalledWith(
        expect.objectContaining({
          handler: mockHealthCheck,
          requiresAuth: false,
        }),
        expect.anything(), // Prisma instance
      );
      expect(mockComposedHandler).toHaveBeenCalledWith(mockEvent);
      expect(result).toEqual(expectedResponse);
    });

    it('should match dynamic routes', async () => {
      mockEvent.path = '/v1/chart/1234567890abcdef/play'; // Example dynamic route
      mockEvent.httpMethod = 'POST';

      const expectedResponse: APIGatewayProxyResult = {
        statusCode: 200,
        body: JSON.stringify({ message: 'Dynamic route matched' }),
      };

      mockComposedHandler.mockResolvedValue(expectedResponse);

      const result = await handler(mockEvent);

      expect(mockComposeMiddleware).toHaveBeenCalled();
      expect(mockComposedHandler).toHaveBeenCalledWith({
        ...mockEvent,
        routeParameters: { chartHash: '1234567890abcdef' },
      });
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for unknown path', async () => {
      mockEvent.path = '/unknown-route';

      const result = await handler(mockEvent);

      expect(result).toEqual({
        statusCode: 404,
        headers: expect.any(Object), // CORS headers
        body: '',
      });
      expect(mockComposeMiddleware).not.toHaveBeenCalled();
    });

    it('should return 404 for known path but wrong method', async () => {
      mockEvent.path = '/';
      mockEvent.httpMethod = 'POST'; // Health check only supports GET

      const result = await handler(mockEvent);

      expect(result).toEqual({
        statusCode: 404,
        headers: expect.any(Object), // CORS headers
        body: '',
      });
      expect(mockComposeMiddleware).not.toHaveBeenCalled();
    });
  });

  describe('Middleware Configuration', () => {
    it('should configure middleware correctly for non-authenticated routes', async () => {
      mockEvent.path = '/';
      mockEvent.httpMethod = 'GET';

      await handler(mockEvent);

      expect(mockComposeMiddleware).toHaveBeenCalledWith(
        expect.objectContaining({
          handler: mockHealthCheck,
          requiresAuth: false,
        }),
        expect.anything(), // Prisma instance
      );
    });

    it('should configure middleware correctly for authenticated routes', async () => {
      mockEvent.path = '/auth-check';
      mockEvent.httpMethod = 'GET';

      await handler(mockEvent);

      expect(mockComposeMiddleware).toHaveBeenCalledWith(
        expect.objectContaining({
          handler: mockAuthCheck,
          requiresAuth: true,
        }),
        expect.anything(), // Prisma instance
      );
    });
  });
});
