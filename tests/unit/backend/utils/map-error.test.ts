import { describe, expect, it } from 'vitest';
import {
  AiProviderError,
  ConfigurationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '@/backend/utils/errors';
import { suggestCapFailure, toHttpError } from '@/backend/utils/map-error';
import { aiCap, genericError } from '@/frontend/copy';

describe('toHttpError', () => {
  it('maps ValidationError to 400 and passes fields through', () => {
    const error = new ValidationError({
      title: 'Title is required.',
      grade: 'Grade is required.',
    });

    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Title is required.');
    expect(toHttpError(error)).toEqual({
      status: 400,
      body: {
        ok: false,
        error: 'Title is required.',
        fields: {
          title: 'Title is required.',
          grade: 'Grade is required.',
        },
      },
    });
  });

  it('maps each domain error to its status', () => {
    const cases = [
      { error: new UnauthenticatedError('Sign in required.'), status: 401, name: 'UnauthenticatedError' },
      { error: new ForbiddenError('You cannot open this plan.'), status: 403, name: 'ForbiddenError' },
      { error: new NotFoundError('That page is not here.'), status: 404, name: 'NotFoundError' },
      { error: new ConflictError('That email already has an account. Sign in.'), status: 409, name: 'ConflictError' },
      { error: new AiProviderError('Could not draft the lesson plan. Write it yourself.'), status: 502, name: 'AiProviderError' },
      {
        error: new ConfigurationError('AI provider must be openai-compatible or gemini.'),
        status: 500,
        name: 'ConfigurationError',
      },
    ];

    for (const entry of cases) {
      expect(entry.error.name).toBe(entry.name);
      expect(toHttpError(entry.error)).toEqual({
        status: entry.status,
        body: { ok: false, error: entry.error.message },
      });
    }
  });

  it('maps a mongoose ValidationError to 400 with field messages', () => {
    const error = new Error('Plan validation failed: title: Title is required.');
    error.name = 'ValidationError';
    Object.assign(error, {
      errors: {
        title: { message: 'Title is required.', path: 'title', kind: 'required' },
        subject: { message: 'Subject is required.', path: 'subject', kind: 'required' },
      },
    });

    expect(toHttpError(error)).toEqual({
      status: 400,
      body: {
        ok: false,
        error: 'Title is required.',
        fields: {
          title: 'Title is required.',
          subject: 'Subject is required.',
        },
      },
    });
  });

  it('names the field when a mongoose error has no message', () => {
    const error = new Error('Plan validation failed: grade: oops.');
    error.name = 'ValidationError';
    Object.assign(error, {
      errors: {
        grade: { path: 'grade', kind: 'min' },
        title: 'broken',
      },
    });

    expect(toHttpError(error)).toEqual({
      status: 400,
      body: {
        ok: false,
        error: 'grade is invalid.',
        fields: {
          grade: 'grade is invalid.',
          title: 'title is invalid.',
        },
      },
    });
  });

  it('uses a form-level sentence when a mongoose error has no fields', () => {
    const error = new Error('Plan validation failed.');
    error.name = 'ValidationError';
    Object.assign(error, { errors: {} });

    expect(toHttpError(error)).toEqual({
      status: 400,
      body: {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: {},
      },
    });
  });

  it('maps a mongoose CastError to 404 without fields', () => {
    const error = new Error('Cast to ObjectId failed for value "nope" (type string) at path "_id"');
    error.name = 'CastError';
    Object.assign(error, { path: '_id', kind: 'ObjectId', value: 'nope' });

    expect(toHttpError(error)).toEqual({
      status: 404,
      body: {
        ok: false,
        error: 'Cast to ObjectId failed for value "nope" (type string) at path "_id"',
      },
    });
  });

  it('hides unknown errors, stacks, and error.stack', () => {
    const error = new Error('MongoServerError: password leaked');
    error.stack = 'Error: MongoServerError: password leaked\n    at secret (db.js:1:1)';

    const mapped = toHttpError(error);

    expect(mapped.status).toBe(500);
    expect(mapped.body).toEqual({ ok: false, error: genericError });
    expect(mapped.body).not.toHaveProperty('stack');
    expect(mapped.body).not.toHaveProperty('error.stack');
    expect(JSON.stringify(mapped)).not.toContain('password leaked');
    expect(JSON.stringify(mapped)).not.toContain('secret');
    expect(toHttpError('boom')).toEqual({ status: 500, body: { ok: false, error: genericError } });
  });
});

describe('suggestCapFailure', () => {
  it('returns 429 with the hourly cap sentence and no fields', () => {
    expect(suggestCapFailure()).toEqual({
      status: 429,
      body: { ok: false, error: aiCap },
    });
    expect(suggestCapFailure().body.error).toBe('No suggestions left this hour. Try again later.');
    expect(suggestCapFailure().body).not.toHaveProperty('fields');
  });
});
