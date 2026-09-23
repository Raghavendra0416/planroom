import {
  AiProviderError,
  ConfigurationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '@/backend/utils/errors';
import { aiCap, genericError } from '@/frontend/copy';

type HttpError = {
  status: number;
  body: { ok: false; error: string; fields?: Record<string, string> };
};

/**
 * Maps a thrown value to an HTTP status and a client-safe JSON body.
 * @param error - Whatever a handler caught, including non-Error values.
 * @returns Status and a body with `ok: false` and no stack trace.
 */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof ValidationError) {
    return {
      status: 400,
      body: { ok: false, error: error.message, fields: error.fields },
    };
  }

  if (error instanceof UnauthenticatedError) {
    return messageBody(401, error.message);
  }

  if (error instanceof ForbiddenError) {
    return messageBody(403, error.message);
  }

  if (error instanceof NotFoundError) {
    return messageBody(404, error.message);
  }

  if (error instanceof ConflictError) {
    return messageBody(409, error.message);
  }

  if (error instanceof AiProviderError) {
    return messageBody(502, error.message);
  }

  if (error instanceof ConfigurationError) {
    return messageBody(500, error.message);
  }

  if (isMongooseValidation(error)) {
    const fields = fieldMessages(error.errors);
    const first = Object.values(fields)[0] ?? 'Invalid';
    return { status: 400, body: { ok: false, error: first, fields } };
  }

  if (isCastError(error)) {
    const message = typeof error.message === 'string' && error.message.length > 0 ? error.message : 'Not found';
    return messageBody(404, message);
  }

  return messageBody(500, genericError);
}

/**
 * Returns the hourly suggestion-cap failure.
 * @returns Status 429 and the `aiCap` sentence, with no fields.
 */
export function suggestCapFailure(): HttpError {
  return messageBody(429, aiCap);
}

/**
 * Builds a body that has a message and no fields.
 * @param status - HTTP status code.
 * @param error - Client-facing sentence.
 * @returns The status and body.
 */
function messageBody(status: number, error: string): HttpError {
  return { status, body: { ok: false, error } };
}

/**
 * Detects a Mongoose validation error without treating our ValidationError as one.
 * @param error - Caught value.
 * @returns True when the value has Mongoose's `errors` map.
 */
function isMongooseValidation(error: unknown): error is { errors: Record<string, unknown> } {
  if (error instanceof ValidationError || !isRecord(error)) {
    return false;
  }
  return error.name === 'ValidationError' && isRecord(error.errors);
}

/**
 * Detects a Mongoose cast failure.
 * @param error - Caught value.
 * @returns True when the value is named CastError.
 */
function isCastError(error: unknown): error is { message?: unknown } {
  return isRecord(error) && error.name === 'CastError';
}

/**
 * Copies Mongoose field errors into a string map, using each path as the key.
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
 * @param value - Any caught or parsed value.
 * @returns True for plain objects and class instances, false for arrays.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
