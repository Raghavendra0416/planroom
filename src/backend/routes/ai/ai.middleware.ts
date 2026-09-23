import type { Actor } from '@/backend/models/types';
import { requireActor } from '@/backend/routes/plans';

/**
 * Loads the signed-in user. Any role may suggest objectives.
 * @param cookieHeader - Raw Cookie header, or null when the request has none.
 * @returns The actor id, role, email, and name.
 * @throws {UnauthenticatedError} When the cookie does not resolve to a user.
 */
export function requireSuggestActor(cookieHeader: string | null): Promise<Actor> {
  return requireActor(cookieHeader);
}
