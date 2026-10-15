import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import jwt from 'jsonwebtoken';

/**
 * Who is calling, for the routes that want to know. The browser is already logged in to the core API,
 * which issues the session JWT (api/src/utils/auth.ts); the same token is accepted here, verified
 * against the same secret, so the caller never has to say who they are.
 *
 * Authentication here is OPTIONAL by design. Every golf read is public, so a missing, malformed,
 * expired or badly-signed token means "anonymous", not an error - a stale session must not break a
 * page that works fine logged out. A route that needs a viewer checks for null itself.
 *
 * What this does NOT do: it trusts the token's claims without asking the core API, so it cannot see a
 * user who was banned or deleted after the token was issued (tokens last up to 30 days). That is fine for
 * "show me my own bests", which are public anyway; a route that acts on a viewer's behalf needs a stronger
 * check than this.
 */
export interface Viewer {
  userId: string;
}

/** How long a fetched secret is reused. Bounds how long a rotated secret keeps old sessions valid on a warm Lambda. */
const SECRET_TTL_MS = 5 * 60 * 1000;

const secrets = new SecretsManagerClient({});
let cached: { secret: string; fetchedAt: number } | null = null;

/** The core API stores the secret as JSON `{ "JWT_SECRET": "..." }`, in the secret named by JWT_SECRET_ARN. */
async function fetchJwtSecret(): Promise<string> {
  if (cached && Date.now() - cached.fetchedAt < SECRET_TTL_MS) return cached.secret;
  const arn = process.env.JWT_SECRET_ARN;
  if (!arn) throw new Error('JWT_SECRET_ARN is not set');
  const response = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const secret = response.SecretString ? (JSON.parse(response.SecretString) as { JWT_SECRET?: string }).JWT_SECRET : undefined;
  if (!secret) throw new Error('JWT secret is empty');
  cached = { secret, fetchedAt: Date.now() };
  return secret;
}

/** The bearer token from an `Authorization` header, or undefined. Function URL header names are lowercase. */
export function bearerToken(headers: Record<string, string | undefined> | undefined): string | undefined {
  const match = headers?.authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

/**
 * Check a token against a secret. The algorithm is pinned to HS256, which is what the core API signs
 * with: leaving it open is how `alg` confusion attacks work. The expiry is enforced by jsonwebtoken.
 * Returns null for anything that is not a currently valid token carrying a user id.
 */
export function verifyToken(token: string, secret: string): Viewer | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.userId !== 'string' || !payload.userId) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

/**
 * The viewer for a request, or null if anonymous. Never throws: if the secret can't be read (a deploy
 * misconfiguration), that is logged loudly and the caller is treated as anonymous, so the public parts
 * of the page keep working while the problem is fixed.
 */
export async function getViewer(
  headers: Record<string, string | undefined> | undefined,
  getSecret: () => Promise<string> = fetchJwtSecret,
): Promise<Viewer | null> {
  const token = bearerToken(headers);
  if (!token) return null;
  try {
    return verifyToken(token, await getSecret());
  } catch (err) {
    console.error('[golf] could not verify the session token - treating the caller as anonymous', err);
    return null;
  }
}
