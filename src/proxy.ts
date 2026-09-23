import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/backend/services/session';

/**
 * Sends signed-out visitors to login for plan and review pages.
 * `/`, `/login`, `/register`, and `/api/auth/*` stay open. Other `/api/*` routes are not matched.
 * @param request - Incoming page request.
 * @returns A redirect to `/login`, or the request unchanged when the session cookie is present.
 */
export function proxy(request: NextRequest): NextResponse {
  if (isPublic(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? '';
  if (token.length === 0) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

/**
 * Plan and review pages that require a session cookie.
 * Home, login, register, and `/api/auth/*` are not matched.
 */
export const config = {
  matcher: ['/plans/:path*', '/hod', '/hod/:path*'],
};

/**
 * Reports paths that work without a session cookie.
 * @param pathname - Request path.
 * @returns True for home, login, register, and auth API routes.
 */
function isPublic(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/api/auth' ||
    pathname.startsWith('/api/auth/')
  );
}
