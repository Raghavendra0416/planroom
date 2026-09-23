import { describe, expect, it } from 'vitest';
import { parsePlanFilters } from '@/frontend/hooks/usePlanFilters';

describe('parsePlanFilters', () => {
  it('defaults sort to updatedAt when sort is missing', () => {
    expect(parsePlanFilters(new URLSearchParams())).toEqual({
      status: '',
      subject: '',
      grade: '',
      q: '',
      sort: 'updatedAt',
    });
  });

  it('maps an unknown sort to updatedAt', () => {
    expect(parsePlanFilters(new URLSearchParams('sort=title')).sort).toBe('updatedAt');
    expect(parsePlanFilters(new URLSearchParams('sort=')).sort).toBe('updatedAt');
  });

  it('keeps createdAt', () => {
    expect(parsePlanFilters(new URLSearchParams('sort=createdAt')).sort).toBe('createdAt');
  });

  it('turns grade into a number', () => {
    expect(parsePlanFilters(new URLSearchParams('grade=8')).grade).toBe(8);
  });

  it('keeps empty strings empty', () => {
    const filters = parsePlanFilters(new URLSearchParams('status=&subject=&grade=&q='));

    expect(filters.status).toBe('');
    expect(filters.subject).toBe('');
    expect(filters.grade).toBe('');
    expect(filters.q).toBe('');
  });

  it('reads status, subject, and q without changing them', () => {
    const filters = parsePlanFilters(new URLSearchParams('status=DRAFT&subject=MATHS&q=fractions'));

    expect(filters.status).toBe('DRAFT');
    expect(filters.subject).toBe('MATHS');
    expect(filters.q).toBe('fractions');
  });

  it('uses a default status only when the status key is absent', () => {
    expect(parsePlanFilters(new URLSearchParams(), { defaultStatus: 'SUBMITTED' }).status).toBe('SUBMITTED');
    expect(parsePlanFilters(new URLSearchParams('status='), { defaultStatus: 'SUBMITTED' }).status).toBe('');
    expect(parsePlanFilters(new URLSearchParams('status=DRAFT'), { defaultStatus: 'SUBMITTED' }).status).toBe('DRAFT');
  });
});
