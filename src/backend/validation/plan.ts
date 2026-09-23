import { z } from 'zod';
import { SUBJECTS, type PlanInput } from '@/backend/models/types';
import { ValidationError } from '@/backend/utils/errors';

const TITLE = 'Title must be 3 to 80 characters.';
const SUBJECT = 'Choose a subject.';
const GRADE = 'Grade must be from 6 to 12.';
const DURATION = 'Duration must be 15 to 120 minutes, in steps of 5.';
const TOPIC = 'Topic must be 3 to 120 characters.';
const OBJECTIVES = 'Objectives must be 1 to 2000 characters.';
const ACTIVITIES = 'Activities must be 1 to 4000 characters.';
const RESOURCES = 'Resources must be at most 2000 characters.';

const titleField = z.string(TITLE).min(3, TITLE).max(80, TITLE);
const subjectField = z.enum(SUBJECTS, SUBJECT);
const gradeField = z.number(GRADE).int(GRADE).min(6, GRADE).max(12, GRADE);
const durationField = z.number(DURATION).int(DURATION).min(15, DURATION).max(120, DURATION).multipleOf(5, DURATION);
const topicField = z.string(TOPIC).min(3, TOPIC).max(120, TOPIC);
const objectivesField = z.string(OBJECTIVES).min(1, OBJECTIVES).max(2000, OBJECTIVES);
const activitiesField = z.string(ACTIVITIES).min(1, ACTIVITIES).max(4000, ACTIVITIES);
const resourcesField = z.string(RESOURCES).max(2000, RESOURCES);

const draftFields = {
  title: titleField.optional(),
  subject: subjectField.optional(),
  grade: gradeField.optional(),
  durationMinutes: durationField.optional(),
  topic: topicField.optional(),
  objectives: objectivesField.optional(),
  activities: activitiesField.optional(),
  resources: resourcesField.optional(),
};

const completeFields = {
  title: titleField,
  subject: subjectField,
  grade: gradeField,
  durationMinutes: durationField,
  topic: topicField,
  objectives: objectivesField,
  activities: activitiesField,
  resources: resourcesField.default(''),
};

/**
 * Draft plan body. Every field is optional, a present value must still fit, and owner fields are stripped.
 */
export const draftPlanSchema = z.preprocess(withoutOwnerFields, z.object(draftFields).strip());

/**
 * Complete plan body. Required fields must fit, omitted resources become `''`, and owner fields are stripped.
 */
export const completePlanSchema = z.preprocess(withoutOwnerFields, z.object(completeFields).strip());

/**
 * Plan fields accepted while saving a draft.
 */
export type DraftPlan = z.infer<typeof draftPlanSchema>;

/**
 * Plan fields required to submit or to save a sent-back plan.
 */
export type CompletePlan = z.infer<typeof completePlanSchema>;

/**
 * Client plan payload. `authorId`, `status`, and `deletedAt` are accepted and ignored.
 */
export interface PlanBody extends PlanInput {
  authorId?: unknown;
  status?: unknown;
  deletedAt?: unknown;
}

/**
 * Client payload for a new plan. `intent: "submit"` also submits it. Owner fields are ignored.
 */
export interface CreatePlanBody extends PlanBody {
  intent?: 'submit';
}

/**
 * Validates a draft body and strips `authorId`, `status`, and `deletedAt`.
 * @param input - Untrusted client payload.
 * @returns The draft fields that were present and valid.
 * @throws {ValidationError} When a present value does not fit its bounds.
 */
export function readDraftPlan(input: unknown): DraftPlan {
  return readPlan(draftPlanSchema, input);
}

/**
 * Validates a complete plan and strips `authorId`, `status`, and `deletedAt`.
 * @param input - Untrusted client payload or a stored plan.
 * @returns The required fields, with resources defaulting to `''`.
 * @throws {ValidationError} When a required field is missing or does not fit.
 */
export function readCompletePlan(input: unknown): CompletePlan {
  return readPlan(completePlanSchema, input);
}

/**
 * Parses a plan schema into a domain validation error.
 * @param schema - Draft or complete plan schema.
 * @param input - Untrusted value.
 * @returns The parsed plan fields.
 * @throws {ValidationError} When parsing fails.
 */
function readPlan<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw planValidationError(parsed.error);
  }
  return parsed.data;
}

/**
 * Copies a client object without the fields the caller is not allowed to set.
 * @param value - Raw parse input.
 * @returns The same value when it is not a plain object, otherwise a copy without owner fields.
 */
function withoutOwnerFields(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'authorId' || key === 'status' || key === 'deletedAt') {
      continue;
    }
    next[key] = item;
  }
  return next;
}

/**
 * Keeps the first message for each field, in schema order.
 * @param error - Zod failure for a plan body.
 * @returns The field map thrown to callers.
 */
function planValidationError(error: z.ZodError): ValidationError {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    const name = typeof key === 'string' ? key : 'form';
    if (fields[name] === undefined) {
      fields[name] = issue.message;
    }
  }

  if (Object.keys(fields).length === 0) {
    return new ValidationError({ form: 'Invalid' });
  }

  return new ValidationError(fields);
}
