import { describe, expect, it } from 'vitest';
import type { LessonPlanRecord } from '@/backend/models/types';
import { summarizePlans } from '@/frontend/components/dashboard/summarizePlans';

function plan(overrides: Partial<LessonPlanRecord> & { id: string }): LessonPlanRecord {
  return {
    resources: '',
    status: 'DRAFT',
    authorId: 'author-1',
    deletedAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

const NOW = Date.parse('2026-09-24T12:00:00.000Z');

describe('summarizePlans', () => {
  it('counts an empty list as zeroes with no groups or recent plans', () => {
    expect(summarizePlans([], NOW)).toEqual({
      counts: { total: 0, draft: 0, submitted: 0, changesRequested: 0, approved: 0 },
      groups: { bySubject: [], byGrade: [] },
      activity: { needsReview: 0, sentBack: 0, approvedThisWeek: 0, recent: [] },
    });
  });

  it('buckets every plan by status while the total counts all plans', () => {
    const summary = summarizePlans(
      [
        plan({ id: 'a', status: 'DRAFT' }),
        plan({ id: 'b', status: 'DRAFT' }),
        plan({ id: 'c', status: 'SUBMITTED' }),
        plan({ id: 'd', status: 'CHANGES_REQUESTED' }),
        plan({ id: 'e', status: 'APPROVED' }),
      ],
      NOW,
    );

    expect(summary.counts).toEqual({ total: 5, draft: 2, submitted: 1, changesRequested: 1, approved: 1 });
    expect(summary.activity.needsReview).toBe(1);
    expect(summary.activity.sentBack).toBe(1);
  });

  it('groups subjects in stored order and skips empty subjects', () => {
    const summary = summarizePlans(
      [
        plan({ id: 'a', subject: 'SCIENCE' }),
        plan({ id: 'b', subject: 'MATHS' }),
        plan({ id: 'c', subject: 'MATHS' }),
        plan({ id: 'd' }),
      ],
      NOW,
    );

    expect(summary.groups.bySubject).toEqual([
      { subject: 'MATHS', count: 2 },
      { subject: 'SCIENCE', count: 1 },
    ]);
  });

  it('groups grades ascending and skips plans without a grade', () => {
    const summary = summarizePlans(
      [plan({ id: 'a', grade: 11 }), plan({ id: 'b', grade: 6 }), plan({ id: 'c', grade: 6 }), plan({ id: 'd' })],
      NOW,
    );

    expect(summary.groups.byGrade).toEqual([
      { grade: 6, count: 2 },
      { grade: 11, count: 1 },
    ]);
  });

  it('counts approved plans updated within seven days as approved this week', () => {
    const summary = summarizePlans(
      [
        plan({ id: 'fresh', status: 'APPROVED', updatedAt: '2026-09-20T12:00:00.000Z' }),
        plan({ id: 'stale', status: 'APPROVED', updatedAt: '2026-09-10T12:00:00.000Z' }),
        plan({ id: 'draft', status: 'DRAFT', updatedAt: '2026-09-23T12:00:00.000Z' }),
      ],
      NOW,
    );

    expect(summary.activity.approvedThisWeek).toBe(1);
  });

  it('lists the four most recently updated plans first', () => {
    const summary = summarizePlans(
      [
        plan({ id: 'old', title: 'Old', status: 'DRAFT', updatedAt: '2026-09-01T10:00:00.000Z' }),
        plan({ id: 'new', title: 'New', status: 'APPROVED', updatedAt: '2026-09-23T10:00:00.000Z' }),
        plan({ id: 'mid', title: 'Mid', status: 'SUBMITTED', updatedAt: '2026-09-15T10:00:00.000Z' }),
        plan({ id: 'older', title: 'Older', status: 'DRAFT', updatedAt: '2026-09-02T10:00:00.000Z' }),
        plan({ id: 'mid2', title: 'Mid 2', status: 'DRAFT', updatedAt: '2026-09-10T10:00:00.000Z' }),
      ],
      NOW,
    );

    expect(summary.activity.recent.map((entry) => entry.id)).toEqual(['new', 'mid', 'mid2', 'older']);
    expect(summary.activity.recent[0]).toEqual({
      id: 'new',
      title: 'New',
      status: 'APPROVED',
      updatedAt: '2026-09-23T10:00:00.000Z',
    });
  });
});
