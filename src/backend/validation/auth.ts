import { z } from 'zod';

/** Shown when register email has no `@` or no dot after it. */
export const emailMessage = 'Enter an email address.';

/** Shown when the register name is empty after trimming. */
export const nameRequiredMessage = 'Enter a name.';

/** Shown when the register name is longer than 80 characters. */
export const nameLengthMessage = 'Name must be at most 80 characters.';

/** Shown when a register password is outside 8 to 72 characters. */
export const passwordLengthMessage = 'Use 8 to 72 characters.';

/** Shown when the email is already stored. */
export const duplicateEmailMessage = 'That email already has an account. Sign in.';

/** Shown when sign-in does not match an account. */
export const signInFailureMessage = 'That email and password did not match.';

/**
 * Fields accepted by register. Unknown keys, including `role`, are stripped.
 */
export const registerSchema = z.object({
  email: z.unknown().optional(),
  password: z.unknown().optional(),
  name: z.unknown().optional(),
});

/**
 * Fields accepted by login. Unknown keys are stripped.
 */
export const loginSchema = z.object({
  email: z.string(),
  password: z.string(),
});

/**
 * Normalized register input. `role` is never part of this result.
 */
export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

/**
 * Normalized login input.
 */
export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Result of reading a register body. Field failures stay out of the user collection.
 */
export type RegisterParse =
  | { ok: true; value: RegisterInput }
  | { ok: false; fields: Record<string, string> };

/**
 * Checks a register body. Email is trimmed and lowercased. Name is trimmed. Role is ignored.
 * @param body - JSON object from the register request.
 * @returns The normalized fields, or the field messages to show.
 */
export function parseRegister(body: unknown): RegisterParse {
  if (!isRecord(body)) {
    return {
      ok: false,
      fields: {
        name: nameRequiredMessage,
        email: emailMessage,
        password: passwordLengthMessage,
      },
    };
  }

  const parsed = registerSchema.safeParse(body);
  const value = parsed.success ? parsed.data : {};
  const fields: Record<string, string> = {};
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
  const password = typeof value.password === 'string' ? value.password : '';

  if (name.length === 0) {
    fields.name = nameRequiredMessage;
  } else if (name.length > 80) {
    fields.name = nameLengthMessage;
  }

  if (!isEmailAddress(email)) {
    fields.email = emailMessage;
  }

  if (typeof value.password !== 'string' || password.length < 8 || password.length > 72) {
    fields.password = passwordLengthMessage;
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, fields };
  }

  return { ok: true, value: { email, password, name } };
}

/**
 * Checks a login body. A shape that is not an email and password is a failed sign-in.
 * @param body - JSON object from the login request.
 * @returns The trimmed email and the password, or null when the shape is wrong.
 */
export function parseLogin(body: unknown): LoginInput | null {
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }

  return {
    email: parsed.data.email.trim().toLowerCase(),
    password: parsed.data.password,
  };
}

/**
 * Reports whether the address contains `@` and a dot after that `@`.
 * @param email - Trimmed, lowercased address.
 * @returns True when both characters are present in that order.
 */
function isEmailAddress(email: string): boolean {
  const at = email.indexOf('@');
  if (at === -1) {
    return false;
  }
  return email.indexOf('.', at + 1) !== -1;
}

/**
 * Reports whether a value is a non-null object.
 * @param value - Candidate JSON value.
 * @returns True for plain objects, false for arrays and null.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
