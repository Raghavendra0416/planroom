import { NextResponse } from 'next/server';
import { createPlanController, requireActor } from '@/backend/routes/plans';
import { toHttpError } from '@/backend/utils/map-error';

interface PlanIdContext {
  params: Promise<{ id: string }>;
}

/** One plan depends on the caller, so this route is never cached. */
export const dynamic = 'force-dynamic';

/**
 * Opens one plan and its notes.
 * @param request - Incoming request. The session cookie is read from its headers.
 * @param context - Route params. `id` is the lesson plan id.
 * @returns `{ plan, notes }`, or the mapped error body.
 */
export function GET(request: Request, context: PlanIdContext): Promise<NextResponse> {
  return respond(request, context, async (actor, id) => (await createPlanController()).get(actor, id));
}

/**
 * Saves a plan. The JSON body is passed through.
 * @param request - Incoming request.
 * @param context - Route params. `id` is the lesson plan id.
 * @returns The saved plan, or the mapped error body.
 */
export function PATCH(request: Request, context: PlanIdContext): Promise<NextResponse> {
  return respond(request, context, async (actor, id, body) => (await createPlanController()).save(actor, id, body));
}

/**
 * Soft-deletes a plan.
 * @param request - Incoming request.
 * @param context - Route params. `id` is the lesson plan id.
 * @returns The removed plan, or the mapped error body.
 */
export function DELETE(request: Request, context: PlanIdContext): Promise<NextResponse> {
  return respond(request, context, async (actor, id) => (await createPlanController()).remove(actor, id));
}

/**
 * Loads the actor and the plan id, then returns the controller JSON.
 * @param request - Incoming request.
 * @param context - Route params.
 * @param work - Controller call for this method.
 * @returns The controller JSON, or the mapped error body.
 */
async function respond(
  request: Request,
  context: PlanIdContext,
  work: (
    actor: Awaited<ReturnType<typeof requireActor>>,
    id: string,
    body: unknown,
  ) => Promise<{ status: number; body: unknown }>,
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const actor = await requireActor(request.headers.get('cookie'));
    const body = request.method === 'PATCH' ? await readJson(request) : undefined;
    const result = await work(actor, id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

/**
 * Parses a JSON body. Invalid JSON becomes `undefined` so the manager can reject it.
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
