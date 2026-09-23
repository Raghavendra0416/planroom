import { z } from 'zod';
import { SUBJECTS } from '@/backend/models/types';
import type { SuggestInput } from '@/backend/services/ai/objective-suggester';
import { ValidationError } from '@/backend/utils/errors';

const TOPIC = 'Topic must be 3 to 120 characters.';
const SUBJECT = 'Choose a subject.';
const GRADE = 'Grade must be from 6 to 12.';
const DURATION = 'Duration must be 15 to 120 minutes, in steps of 5.';

const suggestSchema = z
  .object({
    topic: z.string(TOPIC).min(3, TOPIC).max(120, TOPIC),
    subject: z.enum(SUBJECTS, SUBJECT),
    grade: z.number(GRADE).int(GRADE).min(6, GRADE).max(12, GRADE),
    durationMinutes: z.number(DURATION).int(DURATION).min(15, DURATION).max(120, DURATION).multipleOf(5, DURATION).optional(),
  })
  .strip();

/**
 * Reads a suggest body. Duration may be omitted. Owner and status fields are ignored.
 * @param input - Untrusted JSON body.
 * @returns Topic, subject, grade, and duration when it was sent.
 * @throws {ValidationError} When a present field does not fit, or topic, subject, or grade is missing.
 */
export function readSuggestInput(input: unknown): SuggestInput {
  const parsed = suggestSchema.safeParse(input);
  if (!parsed.success) {
    throw suggestValidationError(parsed.error);
  }

  const suggest: SuggestInput = {
    topic: parsed.data.topic,
    subject: parsed.data.subject,
    grade: parsed.data.grade,
  };
  if (parsed.data.durationMinutes !== undefined) {
    suggest.durationMinutes = parsed.data.durationMinutes;
  }
  return suggest;
}

/**
 * Keeps the first message for each field, in schema order.
 * @param error - Zod failure for a suggest body.
 * @returns The field map thrown to callers.
 */
function suggestValidationError(error: z.ZodError): ValidationError {
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
