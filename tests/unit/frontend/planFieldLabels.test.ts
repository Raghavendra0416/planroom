import { describe, expect, it } from 'vitest';
import { planFailureToast, planFieldLabels } from '@/frontend/components/plans/labels';
import { saveFail, saveFailFields, submitFail, submitFailFields } from '@/frontend/copy';

describe('planFieldLabels', () => {
  it('lists visible labels in form order and skips unknown keys', () => {
    expect(planFieldLabels(['topic', 'title', 'durationMinutes', 'nope'])).toEqual([
      'Title',
      'Duration in minutes',
      'Topic',
    ]);
  });
});

describe('planFailureToast', () => {
  it('names the failing fields for a save', () => {
    expect(planFailureToast(saveFail, saveFailFields, { title: 'Title must be 3 to 80 characters.' })).toBe(
      'Could not save this plan. Fix the highlighted fields: Title.',
    );
  });

  it('names the failing fields for a submit in form order', () => {
    expect(
      planFailureToast(submitFail, submitFailFields, {
        topic: 'Topic must be 3 to 120 characters.',
        title: 'Title must be 3 to 80 characters.',
      }),
    ).toBe('Could not send this plan for review. Fix the highlighted fields: Title, Topic.');
  });

  it('falls back to the generic sentence when no known field failed', () => {
    expect(planFailureToast(saveFail, saveFailFields, {})).toBe(saveFail);
    expect(planFailureToast(submitFail, submitFailFields, { form: 'Check the highlighted fields.' })).toBe(
      submitFail,
    );
  });
});
