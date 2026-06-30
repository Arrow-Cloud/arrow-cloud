// Centralized auth session storage.
//
// When "Remember me" is checked we persist the session in localStorage so it
// survives a browser restart. When it's unchecked we use sessionStorage, which
// is cleared automatically when the tab/window is closed. Reads transparently
// fall back across both stores so callers don't need to know which one is active.

const TOKEN_KEY = 'authToken';
const USER_KEY = 'user';

// The store that currently holds the session, defaulting to localStorage when
// there is no active session yet.
const activeStore = (): Storage => {
  if (localStorage.getItem(TOKEN_KEY) !== null) return localStorage;
  if (sessionStorage.getItem(TOKEN_KEY) !== null) return sessionStorage;
  return localStorage;
};

export const getStoredToken = (): string | null => localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);

export const getStoredUserJson = (): string | null => localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);

/**
 * Persist the token and user for a new session.
 * @param persistent true => localStorage (survives browser restart); false => sessionStorage (cleared when the tab closes).
 */
export const storeSession = (token: string, user: unknown, persistent: boolean): void => {
  const target = persistent ? localStorage : sessionStorage;
  const other = persistent ? sessionStorage : localStorage;
  // Ensure the session only lives in one store.
  other.removeItem(TOKEN_KEY);
  other.removeItem(USER_KEY);
  target.setItem(TOKEN_KEY, token);
  target.setItem(USER_KEY, JSON.stringify(user));
};

/** Update only the cached user object, in whichever store currently holds the session. */
export const storeUser = (user: unknown): void => {
  activeStore().setItem(USER_KEY, JSON.stringify(user));
};

/** Replace only the token, in whichever store currently holds the session. */
export const storeToken = (token: string): void => {
  activeStore().setItem(TOKEN_KEY, token);
};

/** Whether the active session is persistent (localStorage / "remember me") vs tab-scoped (sessionStorage). */
export const isPersistentSession = (): boolean => localStorage.getItem(TOKEN_KEY) !== null;

const decodeJwt = (token: string): { iat?: number; exp?: number } | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/**
 * Whether a token is past the halfway point of its lifetime (and not yet expired),
 * i.e. worth renewing. Self-scaling: a 30d token renews after 15d, a 12h token after 6h.
 */
export const shouldRenewToken = (token: string): boolean => {
  const claims = decodeJwt(token);
  if (!claims?.iat || !claims?.exp) return false;
  const nowSec = Date.now() / 1000;
  if (nowSec >= claims.exp) return false; // already expired — let the normal 401 flow handle it
  const lifetime = claims.exp - claims.iat;
  const elapsed = nowSec - claims.iat;
  return elapsed >= lifetime / 2;
};

export const clearSession = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
};
