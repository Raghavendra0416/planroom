'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Signed-in person stored by the session endpoint.
 */
export interface SessionActor {
  id: string;
  role: 'TEACHER' | 'HOD';
  email: string;
  name: string;
}

/**
 * Session state for client components.
 * `ready` stays false until the first session read finishes, including failure.
 */
export interface SessionContextValue {
  actor: SessionActor | null;
  ready: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Reads the session endpoint. Network and `ok: false` responses mean no actor.
 * @returns The actor from a successful payload, otherwise null.
 */
async function loadActor(): Promise<SessionActor | null> {
  try {
    const response = await fetch('/api/auth/session');
    if (!response.ok) {
      return null;
    }

    const body: unknown = await response.json();
    if (!isOkActor(body)) {
      return null;
    }

    return body.actor;
  } catch {
    return null;
  }
}

/**
 * Holds the signed-in actor and reloads it from `/api/auth/session`.
 * @param props - Provider props.
 * @param props.children - Tree that can read the session.
 * @returns The session context provider.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<SessionActor | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setActor(await loadActor());
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadActor().then((next) => {
      if (!cancelled) {
        setActor(next);
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ actor, ready, refresh }), [actor, ready, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Reads the current session. Must be called under `SessionProvider`.
 * @returns The actor, whether the first read has settled, and a refresh function.
 */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used within SessionProvider.');
  }
  return value;
}

/**
 * Accepts only an `ok: true` payload with a teacher or HOD actor.
 * @param body - Parsed JSON from the session endpoint.
 * @returns True when the payload has a usable actor.
 */
function isOkActor(body: unknown): body is { ok: true; actor: SessionActor } {
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const record = body as Record<string, unknown>;
  if (record.ok !== true) {
    return false;
  }

  return isSessionActor(record.actor);
}

/**
 * Checks the actor fields returned by the session endpoint.
 * @param value - Candidate actor value.
 * @returns True when id, role, email, and name are present.
 */
function isSessionActor(value: unknown): value is SessionActor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const actor = value as Record<string, unknown>;
  return (
    typeof actor.id === 'string' &&
    (actor.role === 'TEACHER' || actor.role === 'HOD') &&
    typeof actor.email === 'string' &&
    typeof actor.name === 'string'
  );
}
