import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSuggestionAvailability, suggestLesson, suggestMore } from '@/frontend/services/ai';

const SUGGESTIONS = {
  objectives: ['Identify fractions.', 'Explain halves.', 'Compare parts.'],
  activities: ['Sort fraction cards in pairs.', 'Shade halves on a number line.', 'Compare fraction pairs.'],
  resources: ['Fraction cards.', 'Worksheets.', 'Rulers.'],
};
const MORE = ['Name unit fractions.', 'Order unit fractions.', 'Build fraction walls.'];

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('suggestLesson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls /api/ai/suggestions once and returns all three categories', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: SUGGESTIONS }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await suggestLesson({ topic: 'Fractions', subject: 'MATHS', grade: 6, durationMinutes: 40 });

    expect(result).toEqual({ ok: true, data: SUGGESTIONS });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/suggestions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects a missing category, a blank item, or a list that is not exactly 3 lines', async () => {
    const invalid = [
      { activities: SUGGESTIONS.activities, resources: SUGGESTIONS.resources },
      { ...SUGGESTIONS, objectives: ['Only one.', 'Only two.'] },
      { ...SUGGESTIONS, objectives: ['a', 'b', 'c', 'd'] },
      { ...SUGGESTIONS, activities: ['   ', 'Shade halves.', 'Compare pairs.'] },
      { ...SUGGESTIONS, resources: [] },
      { ...SUGGESTIONS, resources: 'Fraction cards.' },
    ];

    for (const data of invalid) {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, data })));
      const result = await suggestLesson({ topic: 'Fractions', subject: 'MATHS', grade: 6 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(0);
      }
    }
  });

  it('posts exclusions to /api/ai/suggestions/more and returns 3 novel lines', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: { suggestions: MORE } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await suggestMore({
      topic: 'Fractions',
      subject: 'MATHS',
      grade: 6,
      category: 'objectives',
      exclude: ['Identify fractions.'],
    });

    expect(result).toEqual({ ok: true, data: MORE });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/suggestions/more',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          topic: 'Fractions',
          subject: 'MATHS',
          grade: 6,
          category: 'objectives',
          exclude: ['Identify fractions.'],
        }),
      }),
    );
  });

  it('rejects a follow-up that is not exactly 3 lines', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, data: { suggestions: ['Only one.'] } })));

    const result = await suggestMore({
      topic: 'Fractions',
      subject: 'MATHS',
      grade: 6,
      category: 'objectives',
      exclude: [],
    });

    expect(result.ok).toBe(false);
  });

  it('reads availability from /api/ai/suggestions', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: { enabled: true, available: true } }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getSuggestionAvailability()).toEqual({ ok: true, data: { enabled: true, available: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/suggestions',
      expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
    );
  });
});
