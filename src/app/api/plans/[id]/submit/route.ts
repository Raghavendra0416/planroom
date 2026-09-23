import { NextResponse } from 'next/server';
import { createPlanController, requireActor } from '@/backend/routes/plans';
import { toHttpError } from '@/backend/utils/map-error';

interface PlanIdContext {
  params: Promise<{ id: string }>;
}

/** Submit depends on the caller, so this route is never cached. */
export const dynamic = 'force-dynamic';

/**
 * Submits one plan for review.
 * @param request - Incoming request. The session cookie is read from its headers.
 * @param context - Route params. `id` is the lesson plan id.
 * @returns The submitted plan, or the mapped error body.
 */
export function POST(request: Request, context: PlanIdContext): Promise<NextResponse> {
  return respond(request, context);
}

/**
 * Loads the actor and submits the plan.
 * @param request - Incoming request.
 * @param context - Route params.
 * @returns The controller JSON, or the mapped error body.
 */
async function respond(request: Request, context: PlanIdContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const actor = await requireActor(request.headers.get('cookie'));
    const result = await (await createPlanController()).submit(actor, id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
