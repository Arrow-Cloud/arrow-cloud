import { createHash, randomBytes } from 'crypto';

export function hashPassword(password: string, salt: string): string {
  return createHash('sha256')
    .update(password + salt)
    .digest('hex');
}

export function generateSalt(): string {
  return randomBytes(32).toString('hex');
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const computedHash = hashPassword(password, salt);
  return computedHash === hash;
}
