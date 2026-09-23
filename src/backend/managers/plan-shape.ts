import {
  SUBJECTS,
  type LessonPlanRecord,
  type NoteKind,
  type PlanStatus,
  type ReviewNoteRecord,
  type Role,
  type Subject,
} from '@/backend/models/types';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '@/backend/utils/errors';

/**
 * Shown when a plan is missing or soft-deleted.
 */
export const missingPlanMessage = 'That page is not here.';

/**
 * Shown when a teacher opens someone else's plan.
 */
export const cannotOpenMessage = 'You cannot open this plan.';

/**
 * Shown when a status change is not one of the legal edges.
 */
export const illegalStatusMessage = 'That status change is not allowed.';

const PLAN_STATUSES: readonly PlanStatus[] = ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED'];
const NOTE_KINDS: readonly NoteKind[] = ['COMMENT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REOPENED'];

/**
 * Reports whether a string is a 24-character hex id.
 * @param value - Candidate plan or user id.
 * @returns True when the value can be stored as an ObjectId.
 */
export function isStoredId(value: string): boolean {
  return /^[a-fA-F\d]{24}$/.test(value);
}

/**
 * Compares a stored id with the signed-in user id.
 * @param stored - Author or document id from MongoDB.
 * @param actorId - Signed-in user id.
 * @returns True when both identify the same document.
 */
export function sameId(stored: unknown, actorId: string): boolean {
  return idText(stored).toLowerCase() === actorId.toLowerCase();
}

/**
 * Reports whether a list filter is a real plan status.
 * @param value - Raw `status` query value.
 * @returns True for the four stored statuses.
 */
export function isPlanStatus(value: unknown): value is PlanStatus {
  return typeof value === 'string' && (PLAN_STATUSES as readonly string[]).includes(value);
}

/**
 * Reports whether a list filter is a real subject.
 * @param value - Raw `subject` query value.
 * @returns True for a subject enum value.
 */
export function isSubject(value: unknown): value is Subject {
  return typeof value === 'string' && (SUBJECTS as readonly string[]).includes(value);
}

/**
 * Returns the forbidden sentence when a teacher opens someone else's plan.
 * @param role - Signed-in role.
 * @param authorId - Stored plan author.
 * @param actorId - Signed-in user id.
 * @returns The forbidden sentence, or null when the actor may read the plan.
 */
export function cannotRead(role: Role, authorId: unknown, actorId: string): string | null {
  if (role === 'TEACHER' && !sameId(authorId, actorId)) {
    return cannotOpenMessage;
  }
  return null;
}

/**
 * Maps a stored lesson plan into the JSON record callers return.
 * @param doc - Lean plan or Mongoose document.
 * @returns String ids, ISO dates, and `resources` as a string.
 * @throws {NotFoundError} When the stored dates or status cannot be read.
 */
export function toLessonPlanRecord(doc: object): LessonPlanRecord {
  const record: LessonPlanRecord = {
    id: idText(prop(doc, '_id')),
    resources: text(prop(doc, 'resources')) ?? '',
    status: planStatus(prop(doc, 'status')),
    authorId: idText(prop(doc, 'authorId')),
    deletedAt: deletedAtIso(prop(doc, 'deletedAt')),
    createdAt: isoTime(prop(doc, 'createdAt')),
    updatedAt: isoTime(prop(doc, 'updatedAt')),
  };
  assignText(record, 'title', prop(doc, 'title'));
  assignText(record, 'topic', prop(doc, 'topic'));
  assignText(record, 'objectives', prop(doc, 'objectives'));
  assignText(record, 'activities', prop(doc, 'activities'));
  const subject = subjectOf(prop(doc, 'subject'));
  if (subject !== undefined) {
    record.subject = subject;
  }
  const grade = numberOf(prop(doc, 'grade'));
  if (grade !== undefined) {
    record.grade = grade;
  }
  const durationMinutes = numberOf(prop(doc, 'durationMinutes'));
  if (durationMinutes !== undefined) {
    record.durationMinutes = durationMinutes;
  }
  return record;
}

/**
 * Maps a stored review note into the JSON record callers return.
 * @param doc - Lean note or Mongoose document.
 * @returns String ids and an ISO `createdAt`.
 * @throws {NotFoundError} When the note shape cannot be read.
 */
export function toReviewNoteRecord(doc: object): ReviewNoteRecord {
  const kind = prop(doc, 'kind');
  const body = prop(doc, 'body');
  if (!isNoteKind(kind) || typeof body !== 'string') {
    throw new NotFoundError(missingPlanMessage);
  }

  return {
    id: idText(prop(doc, '_id')),
    planId: idText(prop(doc, 'planId')),
    authorId: idText(prop(doc, 'authorId')),
    body,
    kind,
    createdAt: isoTime(prop(doc, 'createdAt')),
  };
}

/**
 * Rethrows domain errors and maps Mongoose validation or cast failures.
 * @param error - Failure from a plan or note write.
 * @throws {ValidationError} When Mongoose rejected a field.
 * @throws {NotFoundError} When Mongoose could not cast an id.
 */
export function rethrowDomain(error: unknown): never {
  if (
    error instanceof ValidationError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError ||
    error instanceof UnauthenticatedError
  ) {
    throw error;
  }

  if (isRecord(error) && error.name === 'ValidationError' && isRecord(error.errors)) {
    throw new ValidationError(fieldMessages(error.errors));
  }

  if (isRecord(error) && error.name === 'CastError') {
    throw new NotFoundError(missingPlanMessage);
  }

  throw error;
}

/**
 * Reads a stored status or rejects a value outside the enum.
 * @param value - Stored status.
 * @returns The status.
 * @throws {ConflictError} When the stored value is not a plan status.
 */
export function planStatus(value: unknown): PlanStatus {
  if (isPlanStatus(value)) {
    return value;
  }
  throw new ConflictError(illegalStatusMessage);
}

/**
 * Reads one property from a document or a plain object.
 * @param doc - Source object.
 * @param key - Property name.
 * @returns The property value, which may be undefined.
 */
function prop(doc: object, key: string): unknown {
  return (doc as Record<string, unknown>)[key];
}

/**
 * Copies a string field onto the record when the stored value is a string.
 * @param record - Record being built.
 * @param key - Optional text field.
 * @param value - Stored value.
 */
function assignText(
  record: LessonPlanRecord,
  key: 'title' | 'topic' | 'objectives' | 'activities',
  value: unknown,
): void {
  const parsed = text(value);
  if (parsed !== undefined) {
    record[key] = parsed;
  }
}

/**
 * Returns a string value, or undefined for anything else.
 * @param value - Stored field.
 * @returns The string, when that is what was stored.
 */
function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Returns a number value, or undefined for anything else.
 * @param value - Stored field.
 * @returns The number, when that is what was stored.
 */
function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/**
 * Returns a subject enum value, or undefined when the stored value is not one.
 * @param value - Stored subject.
 * @returns The subject, when it is in the enum.
 */
function subjectOf(value: unknown): Subject | undefined {
  if (isSubject(value)) {
    return value;
  }
  return undefined;
}

/**
 * Formats a stored instant as ISO 8601.
 * @param value - Stored date.
 * @returns The ISO timestamp.
 * @throws {NotFoundError} When the value is not a valid date.
 */
function isoTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  throw new NotFoundError(missingPlanMessage);
}

/**
 * Formats a soft-delete timestamp. Anything other than a date is still active.
 * @param value - Stored `deletedAt`.
 * @returns The ISO timestamp, or null.
 */
function deletedAtIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

/**
 * Reads an id string from a hex string or an object with `toString`.
 * @param value - Stored id.
 * @returns The id text, or an empty string when it cannot be read.
 */
function idText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value !== null && typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    const textValue = value.toString();
    return textValue === '[object Object]' ? '' : textValue;
  }
  return '';
}

/**
 * Reports whether a stored note kind is one of the five kinds.
 * @param value - Stored kind.
 * @returns True for a review-note kind.
 */
function isNoteKind(value: unknown): value is NoteKind {
  return typeof value === 'string' && (NOTE_KINDS as readonly string[]).includes(value);
}

/**
 * Copies Mongoose field errors into a string map.
 * @param errors - Mongoose `errors` object.
 * @returns Field names mapped to their messages.
 */
function fieldMessages(errors: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const [key, value] of Object.entries(errors)) {
    if (!isRecord(value)) {
      fields[key] = 'Invalid';
      continue;
    }
    const field = typeof value.path === 'string' && value.path.length > 0 ? value.path : key;
    const message = typeof value.message === 'string' && value.message.length > 0 ? value.message : 'Invalid';
    fields[field] = message;
  }

  return fields;
}

/**
 * Reports whether a value is a non-null object.
 * @param value - Caught or parsed value.
 * @returns True for plain objects and class instances, false for arrays.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
