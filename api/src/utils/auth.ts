import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from './secrets';

export const generateApiKey = (): string => {
  return crypto.randomBytes(32).toString('hex'); // 64-character hex string
};

export const hashApiKey = (key: string): string => {
  return crypto.createHash('sha256').update(key).digest('hex');
};

export const generateJwtToken = async (userId: string, email: string, rememberMe: boolean = true): Promise<string> => {
  const secret = await getJwtSecret();
  const payload = {
    userId,
    email,
    iat: Math.floor(Date.now() / 1000),
  };

  // If remember me is false, token expires in 4 hours. If true, expires in 7 days.
  const expiresIn = rememberMe ? '7d' : '4h';

  return jwt.sign(payload, secret, { expiresIn });
};

export const verifyJwtToken = async (token: string): Promise<{ userId: string; email: string } | null> => {
  try {
    const secret = await getJwtSecret();
    // todo: fix typing
    const payload = jwt.verify(token, secret) as any;
    return {
      userId: payload.userId,
      email: payload.email,
    };
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
};
