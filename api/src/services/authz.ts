import { PrismaClient } from '../../prisma/generated/client';

// Simple in-memory cache for user permissions within a request lifecycle
// Uses a short TTL to handle Lambda container reuse across requests
const permissionsCache = new Map<string, { permissions: string[]; timestamp: number }>();
const CACHE_TTL_MS = 5000; // 5 seconds - short enough to be safe for Lambda reuse

function getCachedPermissions(userId: string): string[] | null {
  const cached = permissionsCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.permissions;
  }
  // Expired or not found - clean up if expired
  if (cached) {
    permissionsCache.delete(userId);
  }
  return null;
}

function setCachedPermissions(userId: string, permissions: string[]): void {
  permissionsCache.set(userId, { permissions, timestamp: Date.now() });
}

// Resolve effective permissions for a user: direct user perms + via roles
export async function resolveUserPermissions(prisma: PrismaClient, userId: string): Promise<string[]> {
  // Check cache first
  const cached = getCachedPermissions(userId);
  if (cached !== null) {
    return cached;
  }

  const [direct, viaRoles] = await Promise.all([
    prisma.userPermission.findMany({
      where: { userId },
      select: { permission: { select: { key: true } } },
    }),
    prisma.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            rolePermissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    }),
  ]);

  const keys = new Set<string>();
  for (const p of direct) keys.add(p.permission.key);
  for (const ur of viaRoles) {
    for (const rp of ur.role.rolePermissions) keys.add(rp.permission.key);
  }
  
  const permissions = Array.from(keys);
  setCachedPermissions(userId, permissions);
  return permissions;
}

export function hasPermission(perms: string[], required: string): boolean {
  return perms.includes(required);
}

export function hasAny(perms: string[], required: string[]): boolean {
  return required.some((r) => perms.includes(r));
}

export function hasAll(perms: string[], required: string[]): boolean {
  return required.every((r) => perms.includes(r));
}
