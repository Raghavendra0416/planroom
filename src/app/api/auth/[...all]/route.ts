import { NextResponse } from 'next/server';
import { createAuthController } from '@/backend/routes/auth';
import { toHttpError } from '@/backend/utils/map-error';

interface AuthRouteContext {
  params: Promise<{ all?: string | string[] }>;
}

/** Auth responses depend on the caller, so this route is never cached. */
export const dynamic = 'force-dynamic';

/**
 * Dispatches GET `/api/auth/*` to the auth controller.
 * @param request - Incoming request. The session cookie is read from its headers.
 * @param context - Catch-all segments after `/api/auth/`.
 * @returns JSON from the controller, or the mapped error body.
 */
export function GET(request: Request, context: AuthRouteContext): Promise<NextResponse> {
  return dispatch(request, context);
}

/**
 * Dispatches POST `/api/auth/*` to the auth controller.
 * @param request - Incoming request, including the JSON body.
 * @param context - Catch-all segments after `/api/auth/`.
 * @returns JSON from the controller, or the mapped error body.
 */
export function POST(request: Request, context: AuthRouteContext): Promise<NextResponse> {
  return dispatch(request, context);
}

/**
 * Reads JSON, calls the controller, and returns `NextResponse`.
 * @param request - Incoming request.
 * @param context - Route params.
 * @returns The controller result, with `Set-Cookie` when a session starts or ends.
 */
async function dispatch(request: Request, context: AuthRouteContext): Promise<NextResponse> {
  try {
    const params = await context.params;
    const controller = await createAuthController();
    const result = await controller.handle({
      method: request.method,
      segments: segmentsFrom(params.all),
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await readJson(request),
      cookie: request.headers.get('cookie'),
    });
    const response = NextResponse.json(result.body, { status: result.status });
    if (result.setCookie) {
      response.headers.append('Set-Cookie', result.setCookie);
    }
    return response;
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

/**
 * Parses a JSON body. Invalid JSON becomes `undefined` so login and register can reject it.
 * @param request - Request whose body should be JSON.
 * @returns The parsed value, or undefined when the body is empty or not JSON.
 */
async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Normalizes the catch-all param to a list of segments.
 * @param all - `all` from the route params.
 * @returns Path segments after `/api/auth/`.
 */
function segmentsFrom(all: string | string[] | undefined): string[] {
  if (Array.isArray(all)) {
    return all;
  }
  if (typeof all === 'string' && all.length > 0) {
    return [all];
  }
  return [];
}
