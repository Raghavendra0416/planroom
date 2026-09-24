import { describe, expect, it } from 'vitest';
import { applySuggestionPreview, type SuggestionCategory } from '@/frontend/hooks/useLessonSuggestions';

const lines: Record<SuggestionCategory, string[]> = {
  objectives: ['Identify fractions.', 'Explain halves.', 'Compare parts.'],
  activities: ['Sort fraction cards in pairs.', 'Shade halves on a number line.', 'Compare fraction pairs.'],
  resources: ['Fraction cards.', 'Worksheets.'],
};

const errors: Record<SuggestionCategory, string> = {
  objectives: 'Objectives must be 1 to 2000 characters.',
  activities: 'Activities must be 1 to 4000 characters.',
  resources: 'Resources must be at most 2000 characters.',
};

const limits: Record<SuggestionCategory, number> = {
  objectives: 2000,
  activities: 4000,
  resources: 2000,
};

const categories: SuggestionCategory[] = ['objectives', 'activities', 'resources'];

describe('applySuggestionPreview', () => {
  for (const category of categories) {
    it(`replaces an empty or whitespace ${category} field with the chosen lines`, () => {
      expect(applySuggestionPreview(category, '', lines[category])).toEqual({
        value: lines[category].join('\n'),
      });
      expect(applySuggestionPreview(category, ' \n\t ', lines[category])).toEqual({
        value: lines[category].join('\n'),
      });
    });

    it(`appends to an existing ${category} field with one separating newline`, () => {
      expect(applySuggestionPreview(category, 'Keep this.', lines[category])).toEqual({
        value: `Keep this.\n${lines[category].join('\n')}`,
      });
      expect(applySuggestionPreview(category, 'Keep this.\n', [lines[category][0] ?? ''])).toEqual({
        value: `Keep this.\n${lines[category][0] ?? ''}`,
      });
    });

    it(`accepts exactly the ${category} limit and rejects anything longer without changing the field`, () => {
      const limit = limits[category];
      const current = 'Keep this.';
      const failure = applySuggestionPreview(category, current, ['x'.repeat(limit)]);

      expect(failure).toEqual({ value: current, error: errors[category] });
      expect(applySuggestionPreview(category, '', ['y'.repeat(limit)])).toEqual({ value: 'y'.repeat(limit) });
      expect(applySuggestionPreview(category, '', ['z'.repeat(limit + 1)])).toEqual({
        value: '',
        error: errors[category],
      });
    });
  }

  it('inserts an entire category atomically so an over-limit category changes nothing', () => {
    const category: SuggestionCategory = 'objectives';
    const current = 'Keep this.';
    const linesToInsert = ['Identify fractions.', 'x'.repeat(2000)];

    expect(applySuggestionPreview(category, current, linesToInsert)).toEqual({
      value: current,
      error: errors[category],
    });
  });
});
