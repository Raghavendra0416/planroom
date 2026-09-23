import { getAuthManager } from '@/backend/app';
import type { AuthManager } from '@/backend/managers/auth.manager';
import type { Actor, UserRecord } from '@/backend/models/types';
import { clearCookie, readSession, SESSION_COOKIE_NAME, sessionCookie, signSession } from '@/backend/services/session';
import { NotFoundError } from '@/backend/utils/errors';
import { loadConfig, type AppConfig } from '@/backend/utils/load-config';
import { connectMongo } from '@/backend/server';

/**
 * Request fields the route adapter passes in. This controller does not read `NextRequest`.
 */
export interface AuthRequest {
  method: string;
  segments: readonly string[];
  body: unknown;
  cookie: string | null;
}

/**
 * Success payload. Failures are thrown and mapped by the route.
 */
export interface AuthSuccess {
  status: number;
  body: { ok: true; actor: Actor | null };
  setCookie?: string;
}

/**
 * HTTP-facing auth actions: register, login, session, and logout.
 */
export class AuthController {
  /**
   * @param auth - Manager that owns register, login, and user lookup.
   * @param config - Loaded config. Session length comes from `auth.sessionDays`.
   */
  constructor(
    private readonly auth: AuthManager,
    private readonly config: AppConfig,
  ) {}

  /**
   * Routes `/api/auth/*` to one action.
   * @param request - Method, path segments, JSON body, and the raw Cookie header.
   * @returns A status, JSON body, and optional Set-Cookie value.
   * @throws {NotFoundError} When the method and path are not an auth action.
   */
  async handle(request: AuthRequest): Promise<AuthSuccess> {
    const path = request.segments.join('/');

    if (request.method === 'POST' && path === 'register') {
      return this.register(request.body);
    }
    if (request.method === 'POST' && path === 'login') {
      return this.login(request.body);
    }
    if (request.method === 'GET' && path === 'session') {
      return this.session(request.cookie);
    }
    if (request.method === 'POST' && path === 'logout') {
      return this.logout();
    }

    throw new NotFoundError('That page is not here.');
  }

  /**
   * Creates a teacher and signs them in.
   * @param body - Register JSON.
   * @returns The actor and a session cookie.
   */
  async register(body: unknown): Promise<AuthSuccess> {
    // 1. Create the teacher account.
    const user = await this.auth.register(body);

    // 2. Sign the session and set the cookie.
    return this.signedIn(user);
  }

  /**
   * Checks the password and signs the account in.
   * @param body - Login JSON.
   * @returns The actor and a session cookie.
   */
  async login(body: unknown): Promise<AuthSuccess> {
    // 1. Check the email and password.
    const user = await this.auth.login(body);

    // 2. Sign the session and set the cookie.
    return this.signedIn(user);
  }

  /**
   * Resolves the session cookie to an actor.
   * @param cookieHeader - Raw Cookie header, or null.
   * @returns The actor, or null when the cookie is missing, expired, or unknown.
   */
  async session(cookieHeader: string | null): Promise<AuthSuccess> {
    const token = readCookie(cookieHeader);
    const userId = token ? readSession(token) : null;
    const user = userId ? await this.auth.getById(userId) : null;
    return { status: 200, body: { ok: true, actor: user ? toActor(user) : null } };
  }

  /**
   * Clears the session cookie.
   * @returns An empty actor and a cookie that expires immediately.
   */
  logout(): AuthSuccess {
    return {
      status: 200,
      body: { ok: true, actor: null },
      setCookie: clearCookie(),
    };
  }

  /**
   * Signs a token for a user that just registered or logged in.
   * @param user - Account to put in the cookie.
   * @returns Status 200, the actor, and the Set-Cookie value.
   */
  private signedIn(user: UserRecord): AuthSuccess {
    const token = signSession(user.id, this.config);
    return {
      status: 200,
      body: { ok: true, actor: toActor(user) },
      setCookie: sessionCookie(token, this.config),
    };
  }
}

/**
 * Builds a controller around the shared manager and the loaded config.
 * @returns An auth controller that does not import Next or React.
 */
export async function createAuthController(): Promise<AuthController> {
  await connectMongo();
  return new AuthController(getAuthManager(), loadConfig());
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
