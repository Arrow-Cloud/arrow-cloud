import { PrismaClient } from '../../prisma/generated/client';
import { AuthenticatedEvent, Middleware, RouteConfig } from '../utils/types';
import { forbiddenResponse } from '../utils/responses';
import { hasAll, hasAny, resolveUserPermissions } from '../services/authz';

export const makeAuthorizeMiddleware = (config: RouteConfig): Middleware => {
  const { requiresPermissions = [], requiresAllPermissions = false } = config;

  const middleware: Middleware = async (event, prisma: PrismaClient) => {
    if (!requiresPermissions.length) return; // nothing to check

    const authEvent = event as AuthenticatedEvent;
    if (!authEvent.user) {
      // Should be caught by auth middleware earlier; deny just in case
      return forbiddenResponse();
    }

    const perms = await resolveUserPermissions(prisma, authEvent.user.id);
    authEvent.userPermissions = perms;

    const ok = requiresAllPermissions ? hasAll(perms, requiresPermissions) : hasAny(perms, requiresPermissions);

    if (!ok) {
      return forbiddenResponse({ error: 'Forbidden', required: requiresPermissions });
    }
  };

  return middleware;
};
