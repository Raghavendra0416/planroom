import { describe, expect, it } from 'vitest';
import { applyObjectivePreview } from '@/frontend/hooks/useSuggestObjectives';

const lines = ['Identify fractions.', 'Explain halves.', 'Compare parts.'];
const objectivesError = 'Objectives must be 1 to 2000 characters.';

describe('applyObjectivePreview', () => {
  it('replaces an empty or whitespace field with the chosen lines', () => {
    expect(applyObjectivePreview('', lines)).toEqual({ objectives: lines.join('\n') });
    expect(applyObjectivePreview(' \n\t ', lines)).toEqual({ objectives: lines.join('\n') });
    expect(applyObjectivePreview('', [lines[0] ?? ''])).toEqual({ objectives: 'Identify fractions.' });
  });

  it('appends a newline when the field has text and does not already end with one', () => {
    expect(applyObjectivePreview('Keep this.', lines)).toEqual({
      objectives: `Keep this.\n${lines.join('\n')}`,
    });
    expect(applyObjectivePreview('Keep this.', ['Identify fractions.'])).toEqual({
      objectives: 'Keep this.\nIdentify fractions.',
    });
  });

  it('does not add a second newline when the field already ends with one', () => {
    expect(applyObjectivePreview('Keep this.\n', ['Identify fractions.'])).toEqual({
      objectives: 'Keep this.\nIdentify fractions.',
    });
  });

  it('leaves the field unchanged when the result would be longer than 2000 characters', () => {
    const current = 'Keep this.';
    const result = applyObjectivePreview(current, ['x'.repeat(2000)]);

    expect(result).toEqual({ objectives: current, error: objectivesError });
    expect(applyObjectivePreview('', ['y'.repeat(2000)])).toEqual({ objectives: 'y'.repeat(2000) });
    expect(applyObjectivePreview('', ['z'.repeat(2001)])).toEqual({
      objectives: '',
      error: objectivesError,
    });
  });
});
