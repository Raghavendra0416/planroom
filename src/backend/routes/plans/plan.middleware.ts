import { getAuthManager } from '@/backend/app';
import type { Actor, UserRecord } from '@/backend/models/types';
import { readSession, SESSION_COOKIE_NAME } from '@/backend/services/session';
import { connectMongo } from '@/backend/server';
import { UnauthenticatedError } from '@/backend/utils/errors';

const SIGN_IN_REQUIRED = 'Sign in required.';

/**
 * Loads the signed-in actor from the session cookie.
 * @param cookieHeader - Raw Cookie header, or null when the request has none.
 * @returns The actor id, role, email, and name.
 * @throws {UnauthenticatedError} When the cookie does not resolve to a user.
 */
export async function requireActor(cookieHeader: string | null): Promise<Actor> {
  // 1. Open Mongo, then read the session cookie.
  await connectMongo();
  const token = readCookie(cookieHeader);

  // 2. Resolve the token to a user. A missing user is unauthenticated for reads and writes.
  const userId = token ? readSession(token) : null;
  const user = userId ? await getAuthManager().getById(userId) : null;
  if (!user) {
    throw new UnauthenticatedError(SIGN_IN_REQUIRED);
  }

  return toActor(user);
}

/**
 * Copies the public actor fields.
 * @param user - Stored user record.
 * @returns The id, role, email, and name.
 */
function toActor(user: UserRecord): Actor {
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
  };
}

/**
 * Reads `planroom_session` from a Cookie header.
 * @param cookieHeader - Raw Cookie header.
 * @returns The token, or null when the cookie is absent or empty.
 */
function readCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator === -1 || trimmed.slice(0, separator) !== SESSION_COOKIE_NAME) {
      continue;
    }
    const value = trimmed.slice(separator + 1);
    return value.length > 0 ? value : null;
  }

  return null;
}
