import { NextResponse } from 'next/server';
import type { PlanListQuery } from '@/backend/managers/plan.manager';
import { createPlanController, requireActor } from '@/backend/routes/plans';
import { toHttpError } from '@/backend/utils/map-error';

/** Plan lists depend on the caller, so this route is never cached. */
export const dynamic = 'force-dynamic';

/**
 * Lists plans for the signed-in actor.
 * @param request - Incoming request. Filters are the query string.
 * @returns `{ ok: true, data: { plans } }`, or the mapped error body.
 */
export function GET(request: Request): Promise<NextResponse> {
  return respond(async () => {
    const actor = await requireActor(request.headers.get('cookie'));
    return (await createPlanController()).list(actor, listQuery(request));
  });
}

/**
 * Creates a plan. The JSON body is passed through, including `intent`.
 * @param request - Incoming request.
 * @returns The created plan, or the mapped error body.
 */
export function POST(request: Request): Promise<NextResponse> {
  return respond(async () => {
    const actor = await requireActor(request.headers.get('cookie'));
    return (await createPlanController()).create(actor, await readJson(request));
  });
}

/**
 * Runs a controller call and maps thrown domain errors.
 * @param work - Controller call that returns a status and JSON body.
 * @returns The controller JSON, or the mapped error body.
 */
async function respond(work: () => Promise<{ status: number; body: unknown }>): Promise<NextResponse> {
  try {
    const result = await work();
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

/**
 * Copies the list query keys through without interpreting them.
 * @param request - Incoming list request.
 * @returns The query the plan manager already knows how to ignore.
 */
function listQuery(request: Request): PlanListQuery {
  const url = new URL(request.url);
  const query: PlanListQuery = {};
  const q = url.searchParams.get('q');
  const sort = url.searchParams.get('sort');
  const status = url.searchParams.get('status');
  const subject = url.searchParams.get('subject');
  const grade = url.searchParams.get('grade');
  if (q !== null) {
    query.q = q;
  }
  if (sort !== null) {
    query.sort = sort;
  }
  if (status !== null) {
    query.status = status;
  }
  if (subject !== null) {
    query.subject = subject;
  }
  if (grade !== null) {
    query.grade = grade;
  }
  return query;
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
