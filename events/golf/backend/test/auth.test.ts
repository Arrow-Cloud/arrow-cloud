import jwt from 'jsonwebtoken';
import { bearerToken, getViewer, verifyToken } from '../src/auth';

const SECRET = 'test-secret';
const sign = (payload: object, options: jwt.SignOptions = {}, secret = SECRET) => jwt.sign(payload, secret, options);

describe('bearerToken', () => {
  it('reads a Bearer token, case-insensitively', () => {
    expect(bearerToken({ authorization: 'Bearer abc.def.ghi' })).toBe('abc.def.ghi');
    expect(bearerToken({ authorization: 'bearer abc' })).toBe('abc');
  });

  it.each([undefined, {}, { authorization: '' }, { authorization: 'Basic abc' }, { authorization: 'Bearer' }, { authorization: 'Bearer a b' }])(
    'is undefined for %j',
    (headers) => {
      expect(bearerToken(headers as Record<string, string>)).toBeUndefined();
    },
  );
});

describe('verifyToken', () => {
  it('returns the user id from a token the core API would have issued', () => {
    // Same payload shape as api/src/utils/auth.ts generateJwtToken.
    expect(verifyToken(sign({ userId: 'u1', email: 'a@b.c' }, { expiresIn: '1h' }), SECRET)).toEqual({ userId: 'u1' });
  });

  it('does not expose the email', () => {
    expect(verifyToken(sign({ userId: 'u1', email: 'a@b.c' }), SECRET)).not.toHaveProperty('email');
  });

  it('rejects a token signed with another secret', () => {
    expect(verifyToken(sign({ userId: 'u1' }, {}, 'other'), SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    expect(verifyToken(sign({ userId: 'u1' }, { expiresIn: -10 }), SECRET)).toBeNull();
  });

  it('rejects an unsigned (alg: none) token', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    expect(verifyToken(`${b64({ alg: 'none', typ: 'JWT' })}.${b64({ userId: 'u1' })}.`, SECRET)).toBeNull();
  });

  it('rejects a different HMAC algorithm - only HS256 is accepted', () => {
    expect(verifyToken(sign({ userId: 'u1' }, { algorithm: 'HS512' }), SECRET)).toBeNull();
  });

  it('rejects a valid token with no usable user id', () => {
    expect(verifyToken(sign({ email: 'a@b.c' }), SECRET)).toBeNull();
    expect(verifyToken(sign({ userId: '' }), SECRET)).toBeNull();
    expect(verifyToken(sign({ userId: 42 }), SECRET)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(verifyToken('not-a-jwt', SECRET)).toBeNull();
  });
});

describe('getViewer', () => {
  const header = (token: string) => ({ authorization: `Bearer ${token}` });

  it('is the token holder for a valid token', async () => {
    expect(await getViewer(header(sign({ userId: 'u1' })), async () => SECRET)).toEqual({ userId: 'u1' });
  });

  it('is anonymous with no header, and never looks up the secret', async () => {
    const getSecret = jest.fn(async () => SECRET);
    expect(await getViewer({}, getSecret)).toBeNull();
    expect(getSecret).not.toHaveBeenCalled();
  });

  it('is anonymous for a bad token', async () => {
    expect(await getViewer(header('nope'), async () => SECRET)).toBeNull();
  });

  it('is anonymous, not an error, when the secret cannot be read', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(
      await getViewer(header(sign({ userId: 'u1' })), async () => {
        throw new Error('AccessDenied');
      }),
    ).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
