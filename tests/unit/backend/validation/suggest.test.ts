import { describe, expect, it } from 'vitest';
import { readSuggestInput, readSuggestMoreInput } from '@/backend/validation/suggest';
import { ValidationError } from '@/backend/utils/errors';

const base = { topic: 'Fractions', subject: 'MATHS', grade: 6, durationMinutes: 40 };

describe('readSuggestInput', () => {
  it('names the failing field on bad input', () => {
    let error: unknown;
    try {
      readSuggestInput({ topic: 'x', subject: 'MATHS', grade: 6 });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ fields: { topic: 'Topic must be 3 to 120 characters.' } });
    expect((error as ValidationError).message).toBe('Topic must be 3 to 120 characters.');
  });

  it('uses a form-level sentence when no field path exists', () => {
    let error: unknown;
    try {
      readSuggestInput(null);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ fields: { form: 'Check the highlighted fields.' } });
    expect((error as ValidationError).message).toBe('Check the highlighted fields.');
  });

  it('reads the class context and omits an unsent duration', () => {
    expect(readSuggestInput(base)).toEqual(base);
    expect(readSuggestInput({ topic: 'Fractions', subject: 'MATHS', grade: 6 })).toEqual({
      topic: 'Fractions',
      subject: 'MATHS',
      grade: 6,
    });
  });
});

describe('readSuggestMoreInput', () => {
  it('reads the category and excluded lines', () => {
    expect(readSuggestMoreInput({ ...base, category: 'objectives', exclude: ['Identify fractions.'] })).toEqual({
      ...base,
      category: 'objectives',
      exclude: ['Identify fractions.'],
    });
  });

  it('defaults exclude to an empty list', () => {
    expect(readSuggestMoreInput({ ...base, category: 'activities' })).toEqual({
      ...base,
      category: 'activities',
      exclude: [],
    });
  });

  it('rejects an unknown category or too many excluded lines', () => {
    for (const body of [
      { ...base, category: 'topics', exclude: [] },
      { ...base, exclude: [] },
      { ...base, category: 'resources', exclude: Array.from({ length: 31 }, (_, index) => `Line ${index}.`) },
      { ...base, category: 'resources', exclude: ['   '] },
    ]) {
      let error: unknown;
      try {
        readSuggestMoreInput(body);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ValidationError);
    }
  });
});
