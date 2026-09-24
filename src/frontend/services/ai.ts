/**
 * Failed `/api` call. `fields` is empty when the error was not a field map.
 */
export interface SuggestFailure {
  ok: false;
  status: number;
  error: string;
  fields: Record<string, string>;
}

/**
 * Result of a suggest call. Pages branch on `ok`.
 */
export type SuggestResult<T> = { ok: true; data: T } | SuggestFailure;

/**
 * Fields sent to draft a lesson. Grade and duration are omitted until the form has them.
 */
export interface SuggestRequest {
  topic: string;
  subject: string;
  grade?: number;
  durationMinutes?: number;
}

export type SuggestCategory = 'objectives' | 'activities' | 'resources';

/**
 * Fields sent for 3 more lines in one category. `exclude` holds every line
 * already shown, inserted, or dismissed so the model does not repeat them.
 */
export interface SuggestMoreRequest extends SuggestRequest {
  category: SuggestCategory;
  exclude: string[];
}

/**
 * Whether the lesson suggestion button can be pressed.
 */
export interface SuggestionAvailability {
  enabled: boolean;
  available: boolean;
}

/**
 * Aligned suggestion lists returned by one AI call.
 */
export interface LessonSuggestions {
  objectives: string[];
  activities: string[];
  resources: string[];
}

/**
 * Reads whether suggestions are switched on and whether a key is configured.
 * @returns `enabled` and `available`. This call does not ask for suggestions.
 */
export async function getSuggestionAvailability(): Promise<SuggestResult<SuggestionAvailability>> {
  const result = await request<{ enabled?: unknown; available?: unknown }>('/api/ai/suggestions');
  if (!result.ok) {
    return result;
  }
  if (typeof result.data.enabled !== 'boolean' || typeof result.data.available !== 'boolean') {
    return failure(0, undefined);
  }
  return { ok: true, data: { enabled: result.data.enabled, available: result.data.available } };
}

/**
 * Asks once for 3 objectives, 3 activities, and 3 resources. The plan is not saved by this call.
 * @param input - Topic, subject, grade, and optional duration.
 * @returns The aligned suggestion lists, or a failure. A provider failure leaves the button usable.
 */
export async function suggestLesson(
  input: SuggestRequest,
): Promise<SuggestResult<LessonSuggestions>> {
  const result = await request<{ objectives?: unknown; activities?: unknown; resources?: unknown }>(
    '/api/ai/suggestions',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  if (!result.ok) {
    return result;
  }
  if (
    !isSuggestionList(result.data.objectives, 3) ||
    !isSuggestionList(result.data.activities, 3) ||
    !isSuggestionList(result.data.resources, 3)
  ) {
    return failure(0, undefined);
  }
  return {
    ok: true,
    data: {
      objectives: result.data.objectives as string[],
      activities: result.data.activities as string[],
      resources: result.data.resources as string[],
    },
  };
}

/**
 * Asks once for 3 more lines in one category. The plan is not saved by this call.
 * @param input - Class context, the category, and lines the model must not repeat.
 * @returns The 3 novel lines, or a failure.
 */
export async function suggestMore(input: SuggestMoreRequest): Promise<SuggestResult<string[]>> {
  const result = await request<{ suggestions?: unknown }>('/api/ai/suggestions/more', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!result.ok) {
    return result;
  }
  if (!isSuggestionList(result.data.suggestions, 3)) {
    return failure(0, undefined);
  }
  return { ok: true, data: result.data.suggestions as string[] };
}

/**
 * Calls `/api` and normalizes the envelope.
 * @param path - Path beginning with `/api`.
 * @param init - Optional method and JSON body.
 * @returns The `data` payload, or a failure. Network errors use status 0.
 */
async function request<T>(path: string, init?: RequestInit): Promise<SuggestResult<T>> {
  try {
    const response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    const body = await readBody(response);
    if (!response.ok || !isOk(body)) {
      return failure(response.status, body);
    }
    return { ok: true, data: body.data as T };
  } catch {
    return failure(0, undefined);
  }
}

/**
 * Reads JSON. A non-JSON body is treated as an empty failure payload.
 * @param response - Fetch response.
 * @returns The parsed JSON, or undefined.
 */
async function readBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Builds a failure result from an error envelope.
 * @param status - HTTP status, or 0 when the call did not return JSON.
 * @param body - Parsed body, which may not be an object.
 * @returns The failure. Field messages are copied when they are strings.
 */
function failure(status: number, body: unknown): SuggestFailure {
  return {
    ok: false,
    status,
    error: isRecord(body) && typeof body.error === 'string' ? body.error : '',
    fields: readFields(body),
  };
}

/**
 * Copies string field messages.
 * @param body - Parsed body.
 * @returns The string entries of `fields`, or an empty map.
 */
function readFields(body: unknown): Record<string, string> {
  if (!isRecord(body) || !isRecord(body.fields)) {
    return {};
  }

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.fields)) {
    if (typeof value === 'string') {
      fields[key] = value;
    }
  }
  return fields;
}

/**
 * Accepts only an `ok: true` envelope.
 * @param body - Parsed JSON.
 * @returns True when `ok` is true and `data` is present.
 */
function isOk(body: unknown): body is { ok: true; data: unknown } {
  return isRecord(body) && body.ok === true && 'data' in body;
}

/**
 * Checks one suggestion category of exactly 3 lines.
 * @param value - Candidate category payload.
 * @param count - Required item count.
 * @returns True when every entry is a non-blank string and the count is exactly 3.
 */
function isSuggestionList(value: unknown, count: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === count &&
    value.every((line) => typeof line === 'string' && line.trim() !== '')
  );
}

/**
 * Reports whether a value is a non-null object.
 * @param value - Any parsed JSON value.
 * @returns True for objects, false for arrays and null.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
