import { NextResponse } from 'next/server';
import { createAiController, requireSuggestActor } from '@/backend/routes/ai';
import { toHttpError } from '@/backend/utils/map-error';

/** Follow-up suggestions depend on the request body, so this route is never cached. */
export const dynamic = 'force-dynamic';

/**
 * Drafts 3 more lines for one category without repeating excluded lines. The plan is not written.
 * @param request - Incoming request. The JSON body is class context, the category, and excluded lines.
 * @returns `{ suggestions }`, the hour-cap failure, or the mapped error body.
 */
export function POST(request: Request): Promise<NextResponse> {
  return respond(async () => {
    await requireSuggestActor(request.headers.get('cookie'));
    return (await createAiController()).suggestMore(await readJson(request));
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
 * Parses a JSON body. Invalid JSON becomes `undefined` so validation can reject it.
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
