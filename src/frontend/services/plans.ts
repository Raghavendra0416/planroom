import type { LessonPlanRecord, ReviewNoteRecord } from '@/backend/models/types';

/**
 * Filters already parsed by `usePlanFilters`. This service does not read the query string.
 */
interface ParsedPlanFilters {
  status: string;
  subject: string;
  grade: number | '';
  q: string;
  sort: 'updatedAt' | 'createdAt';
}

/**
 * Failed `/api` call. `fields` is empty when the error was not a field map.
 */
export interface ApiFailure {
  ok: false;
  status: number;
  error: string;
  fields: Record<string, string>;
}

/**
 * Result of a plan service call. Pages branch on `ok`.
 */
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

/**
 * Plan fields sent to create and save. Empty draft fields are omitted by the caller.
 */
export interface PlanWriteBody {
  title?: string;
  subject?: string;
  grade?: number;
  durationMinutes?: number;
  topic?: string;
  objectives?: string;
  activities?: string;
  resources?: string;
  intent?: 'submit';
}

type ReviewAction = 'request_changes' | 'approve' | 'reopen' | 'comment';

/**
 * Lists plans using filters that `usePlanFilters` already parsed.
 * @param filters - Parsed list filters. This function does not read the query string.
 * @returns The plans, or a failure.
 */
export async function listPlans(filters: ParsedPlanFilters): Promise<ApiResult<LessonPlanRecord[]>> {
  const result = await request<{ plans?: unknown }>(`/api/plans?${listQuery(filters)}`);
  if (!result.ok) {
    return result;
  }
  if (!Array.isArray(result.data.plans) || !result.data.plans.every(isPlan)) {
    return failure(0, undefined);
  }
  return { ok: true, data: result.data.plans };
}

/**
 * Opens one plan and its notes.
 * @param planId - Lesson plan id.
 * @returns The plan and notes, or a failure. Status 404 and 403 are left for the page to name.
 */
export async function getPlan(planId: string): Promise<ApiResult<{ plan: LessonPlanRecord; notes: ReviewNoteRecord[] }>> {
  const result = await request<{ plan?: unknown; notes?: unknown }>(planPath(planId));
  if (!result.ok) {
    return result;
  }
  if (!isPlan(result.data.plan) || !Array.isArray(result.data.notes) || !result.data.notes.every(isNote)) {
    return failure(0, undefined);
  }
  return { ok: true, data: { plan: result.data.plan, notes: result.data.notes } };
}

/**
 * Creates a plan. Pass `intent: "submit"` to save and submit in one call.
 * @param body - Plan fields.
 * @returns The created plan, or a failure with field messages.
 */
export function createPlan(body: PlanWriteBody): Promise<ApiResult<LessonPlanRecord>> {
  return writePlan('/api/plans', 'POST', body);
}

/**
 * Saves a plan without changing its status.
 * @param planId - Lesson plan id.
 * @param body - Replacement fields.
 * @returns The saved plan, or a failure with field messages.
 */
export function savePlan(planId: string, body: PlanWriteBody): Promise<ApiResult<LessonPlanRecord>> {
  return writePlan(planPath(planId), 'PATCH', body);
}

/**
 * Submits the owner's draft or sent-back plan.
 * @param planId - Lesson plan id.
 * @returns The submitted plan, or a failure.
 */
export function submitPlan(planId: string): Promise<ApiResult<LessonPlanRecord>> {
  return writePlan(`${planPath(planId)}/submit`, 'POST');
}

/**
 * Soft-deletes a plan. The page still navigates to `/plans`.
 * @param planId - Lesson plan id.
 * @returns The removed plan, or a failure.
 */
export function removePlan(planId: string): Promise<ApiResult<LessonPlanRecord>> {
  return writePlan(planPath(planId), 'DELETE');
}

/**
 * Sends a plan back, approves it, reopens it, or comments on it.
 * @param planId - Lesson plan id.
 * @param action - Review action name.
 * @param note - Note for send back, reopen, and comment. Omit it for approve.
 * @returns The updated plan or the new comment, or a failure.
 */
export function reviewPlan(planId: string, action: ReviewAction, note?: string): Promise<ApiResult<LessonPlanRecord | ReviewNoteRecord>> {
  const body = note === undefined ? { action } : { action, note };
  return request<LessonPlanRecord | ReviewNoteRecord>(`${planPath(planId)}/review`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Writes a plan route and checks that the payload is a plan.
 * @param path - `/api` path.
 * @param method - HTTP method.
 * @param body - JSON body, omitted for submit and remove.
 * @returns The plan, or a failure.
 */
async function writePlan(path: string, method: string, body?: PlanWriteBody): Promise<ApiResult<LessonPlanRecord>> {
  const result = await request<unknown>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!result.ok) {
    return result;
  }
  if (!isPlan(result.data)) {
    return failure(0, undefined);
  }
  return { ok: true, data: result.data };
}

/**
 * Calls `/api` and normalizes the envelope.
 * @param path - Path beginning with `/api`.
 * @param init - Optional method and JSON body.
 * @returns The `data` payload, or a failure. Network errors use status 0.
 */
async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
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
 * Builds the list query from parsed filters.
 * @param filters - Parsed filters.
 * @returns The query string, including the sort.
 */
function listQuery(filters: ParsedPlanFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== '') {
    params.set('status', filters.status);
  }
  if (filters.subject !== '') {
    params.set('subject', filters.subject);
  }
  if (filters.grade !== '') {
    params.set('grade', String(filters.grade));
  }
  if (filters.q !== '') {
    params.set('q', filters.q);
  }
  params.set('sort', filters.sort);
  return params.toString();
}

/**
 * Builds a plan path with an encoded id.
 * @param planId - Lesson plan id.
 * @returns The `/api/plans/:id` path.
 */
function planPath(planId: string): string {
  return `/api/plans/${encodeURIComponent(planId)}`;
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
function failure(status: number, body: unknown): ApiFailure {
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
 * Checks the plan fields the screens read.
 * @param value - Candidate payload.
 * @returns True when id, status, and authorId are strings.
 */
function isPlan(value: unknown): value is LessonPlanRecord {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === 'string' && typeof value.status === 'string' && typeof value.authorId === 'string';
}

/**
 * Checks the note fields the timeline reads.
 * @param value - Candidate note.
 * @returns True when id, body, and createdAt are strings.
 */
function isNote(value: unknown): value is ReviewNoteRecord {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === 'string' && typeof value.body === 'string' && typeof value.createdAt === 'string';
}

/**
 * Reports whether a value is a non-null object.
 * @param value - Any parsed JSON value.
 * @returns True for objects, false for arrays and null.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
