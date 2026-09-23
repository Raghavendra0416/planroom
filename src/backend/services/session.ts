import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigurationError } from '@/backend/utils/errors';
import type { AppConfig } from '@/backend/utils/load-config';

/** Cookie that carries the signed session token. */
export const SESSION_COOKIE_NAME = 'planroom_session';

const SECONDS_PER_DAY = 86400;

/**
 * Signs a session token for a user.
 * @param userId - User id stored as `sub`.
 * @param config - Application config. `auth.sessionDays` sets the expiry.
 * @returns `base64url(payload).base64url(hmac)`.
 * @throws {ConfigurationError} When `AUTH_SECRET` is missing or blank.
 */
export function signSession(userId: string, config: AppConfig): string {
  const secret = readAuthSecret();
  if (!secret) {
    throw new ConfigurationError('AUTH_SECRET is required.');
  }

  const exp = Math.floor(Date.now() / 1000) + sessionMaxAge(config);
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

/**
 * Reads a session token.
 * @param token - Value of the `planroom_session` cookie.
 * @returns The user id, or null when the secret, signature, payload, or expiry is bad.
 */
export function readSession(token: string): string | null {
  const secret = readAuthSecret();
  if (!secret) {
    return null;
  }

  const separator = token.indexOf('.');
  if (separator <= 0 || separator !== token.lastIndexOf('.')) {
    return null;
  }

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  const parsed = parsePayload(payload);
  if (!parsed || parsed.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return parsed.sub;
}

/**
 * Builds the Set-Cookie header for a new session.
 * @param token - Signed session token.
 * @param config - Application config. `auth.sessionDays` sets Max-Age.
 * @returns The Set-Cookie header value. `Secure` is set only when `APP_ENV` is `production`.
 */
export function sessionCookie(token: string, config: AppConfig): string {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAge(config)}${secureAttribute()}`;
}

/**
 * Builds the Set-Cookie header that removes the session.
 * @returns The Set-Cookie header value with Max-Age 0.
 */
export function clearCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureAttribute()}`;
}

/**
 * Reads `AUTH_SECRET` without trimming a non-blank value.
 * @returns The secret, or null when it is missing or blank.
 */
function readAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (typeof secret !== 'string' || secret.trim() === '') {
    return null;
  }
  return secret;
}

/**
 * Converts `auth.sessionDays` to a whole number of seconds.
 * @param config - Application config.
 * @returns Max-Age and token lifetime in seconds.
 */
function sessionMaxAge(config: AppConfig): number {
  return Math.floor(config.auth.sessionDays * SECONDS_PER_DAY);
}

/**
 * Adds `Secure` only for the production app environment. `NODE_ENV` is ignored.
 * @returns The attribute, or an empty string outside production.
 */
function secureAttribute(): string {
  return process.env.APP_ENV === 'production' ? '; Secure' : '';
}

/**
 * Decodes the signed payload.
 * @param payload - base64url JSON `{ sub, exp }`.
 * @returns The claims, or null when the JSON is not a session payload.
 */
function parsePayload(payload: string): { sub: string; exp: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (error) {
    if (error instanceof Error) {
      return null;
    }
    throw error;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.sub !== 'string' || record.sub.length === 0) {
    return null;
  }
  if (typeof record.exp !== 'number' || !Number.isFinite(record.exp)) {
    return null;
  }

  return { sub: record.sub, exp: record.exp };
}
