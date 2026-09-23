import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { clearCookie, readSession, sessionCookie, signSession } from '@/backend/services/session';
import { ConfigurationError } from '@/backend/utils/errors';
import { loadConfig, resetConfigCache } from '@/backend/utils/load-config';

const previousSecret = process.env.AUTH_SECRET;
const previousAppEnv = process.env.APP_ENV;

function setEnv(name: 'AUTH_SECRET' | 'APP_ENV', value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[name];
  } else {
    env[name] = value;
  }
}

describe('session cookie', () => {
  afterEach(() => {
    setEnv('AUTH_SECRET', previousSecret);
    setEnv('APP_ENV', previousAppEnv);
    resetConfigCache();
  });

  it('signs a token that reads back the user id', () => {
    setEnv('AUTH_SECRET', 'test-secret');
    setEnv('APP_ENV', undefined);
    const config = loadConfig();
    const token = signSession('abc123', config);

    expect(readSession(token)).toBe('abc123');
    expect(token.split('.')).toHaveLength(2);
  });

  it('rejects a bad signature, an expired token, and a missing secret', () => {
    setEnv('AUTH_SECRET', 'test-secret');
    const config = loadConfig();
    const token = signSession('abc123', config);
    const flipped = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    const payload = Buffer.from(JSON.stringify({ sub: 'abc123', exp: 1 }), 'utf8').toString('base64url');
    const signature = createHmac('sha256', 'test-secret').update(payload).digest('base64url');

    expect(readSession(flipped)).toBeNull();
    expect(readSession(`${payload}.${signature}`)).toBeNull();

    setEnv('AUTH_SECRET', undefined);
    expect(readSession(token)).toBeNull();
    expect(() => signSession('abc123', config)).toThrow(ConfigurationError);
    expect(() => signSession('abc123', config)).toThrow('AUTH_SECRET is required.');
  });

  it('sets httpOnly, lax, path, and a 14-day max-age, and Secure only in production', () => {
    setEnv('AUTH_SECRET', 'test-secret');
    setEnv('APP_ENV', undefined);
    const config = loadConfig();
    const token = signSession('abc123', config);
    const cookie = sessionCookie(token, config);

    expect(cookie).toBe(
      `planroom_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600`,
    );
    expect(clearCookie()).toBe('planroom_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');

    setEnv('APP_ENV', 'production');
    expect(sessionCookie(token, config)).toBe(`${cookie}; Secure`);
    expect(clearCookie()).toBe('planroom_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure');
  });
});
