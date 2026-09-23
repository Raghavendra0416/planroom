import { NextResponse } from 'next/server';
import { createReviewController, requireReviewActor } from '@/backend/routes/reviews';
import { toHttpError } from '@/backend/utils/map-error';

interface PlanIdContext {
  params: Promise<{ id: string }>;
}

/** Review writes depend on the caller, so this route is never cached. */
export const dynamic = 'force-dynamic';

/**
 * Sends a plan back, approves it, reopens it, or comments on it.
 * @param request - Incoming request. The body is `{ action, note? }`.
 * @param context - Route params. `id` is the lesson plan id.
 * @returns The updated plan or the new comment, or the mapped error body.
 */
export function POST(request: Request, context: PlanIdContext): Promise<NextResponse> {
  return respond(request, context);
}

/**
 * Loads the actor and applies the review action.
 * @param request - Incoming request.
 * @param context - Route params.
 * @returns The controller JSON, or the mapped error body.
 */
async function respond(request: Request, context: PlanIdContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const actor = await requireReviewActor(request.headers.get('cookie'));
    const result = await (await createReviewController()).review(actor, id, await readJson(request));
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

/**
 * Parses a JSON body. Invalid JSON becomes `undefined` so the controller can reject it.
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
