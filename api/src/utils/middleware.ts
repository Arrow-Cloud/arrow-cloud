import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '../../prisma/generated/client';
import { AuthenticatedRouteHandler, AuthenticatedEvent, ExtendedAPIGatewayProxyEvent, Middleware, RouteConfig, RouteHandler } from '../utils/types';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authenticate';
import { makeAuthorizeMiddleware } from '../middleware/authorize';

const addCorsHeaders = (response: APIGatewayProxyResult): APIGatewayProxyResult => {
  return {
    ...response,
    headers: {
      ...response.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
  };
};

export const composeMiddleware = (config: RouteConfig, prisma: PrismaClient) => {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const middlewares: Middleware[] = [];
    const handler: RouteHandler | AuthenticatedRouteHandler = config.handler;

    // Add auth middleware if required
    if (config.requiresAuth) {
      middlewares.push(authMiddleware);
    } else if (config.optionalAuth) {
      // Optional auth - try to authenticate but don't fail if no token
      middlewares.push(optionalAuthMiddleware);
    }

    // Authorization middleware if route declares permissions (after auth)
    if (config.requiresPermissions && config.requiresPermissions.length) {
      if (!config.requiresAuth) {
        // If permissions are required, auth must also be required
        middlewares.push(authMiddleware);
      }
      middlewares.push(makeAuthorizeMiddleware(config));
    }

    // Add any additional middlewares
    if (config.middleware) {
      middlewares.push(...config.middleware);
    }

    // Execute middlewares in order
    for (const middleware of middlewares) {
      const result = await middleware(event, prisma);
      if (result) {
        // Middleware returned a response, short-circuit
        return addCorsHeaders(result);
      }
    }

    // All middlewares passed, execute the handler
    let response: APIGatewayProxyResult;
    if (config.requiresAuth) {
      // If auth is required, the event should now have the user property attached
      const authenticatedHandler = handler as AuthenticatedRouteHandler;
      response = await authenticatedHandler(event as AuthenticatedEvent, prisma);
    } else {
      // For non-authenticated routes, handler should be a regular RouteHandler
      const regularHandler = handler as RouteHandler;
      response = await regularHandler(event as ExtendedAPIGatewayProxyEvent, prisma);
    }

    return addCorsHeaders(response);
  };
};
