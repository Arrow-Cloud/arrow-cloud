import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient, User } from '../../prisma/generated/client';

export interface ExtendedAPIGatewayProxyEvent extends APIGatewayProxyEvent {
  routeParameters?: Record<string, string>;
}

export interface AuthenticatedEvent extends ExtendedAPIGatewayProxyEvent {
  user: User;
  // Resolved effective permissions for this request (optional; set by authorize middleware)
  userPermissions?: string[];
}

// For routes with optionalAuth - user may or may not be present
export interface OptionalAuthEvent extends ExtendedAPIGatewayProxyEvent {
  user?: User;
}

export type RouteHandler = (event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient) => Promise<APIGatewayProxyResult>;
export type AuthenticatedRouteHandler = (event: AuthenticatedEvent, prisma: PrismaClient) => Promise<APIGatewayProxyResult>;
export type OptionalAuthRouteHandler = (event: OptionalAuthEvent, prisma: PrismaClient) => Promise<APIGatewayProxyResult>;

export type Middleware = (event: ExtendedAPIGatewayProxyEvent, prisma: PrismaClient) => Promise<APIGatewayProxyResult | void>;

export interface RouteConfig {
  handler: RouteHandler | AuthenticatedRouteHandler | OptionalAuthRouteHandler;
  requiresAuth?: boolean;
  optionalAuth?: boolean; // If true, will try to authenticate but won't fail if no auth provided
  middleware?: Middleware[];
  patternMatching?: Record<string, RegExp>;
  routeParameters?: Record<string, string>;
  // Authorization options (checked after authentication)
  requiresPermissions?: string[];
  requiresAllPermissions?: boolean; // default false = any-of
}

export type Routes = {
  [path: string]: {
    [method: string]: RouteConfig;
  };
};
