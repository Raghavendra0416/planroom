import { SUBJECTS, type LessonPlanRecord, type PlanStatus, type Subject } from '@/backend/models/types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlanCounts {
  total: number;
  draft: number;
  submitted: number;
  changesRequested: number;
  approved: number;
}

export interface SubjectGroup {
  subject: Subject;
  count: number;
}

export interface GradeGroup {
  grade: number;
  count: number;
}

export interface RecentPlan {
  id: string;
  title: string;
  status: PlanStatus;
  updatedAt: string;
}

export interface PlanSummary {
  counts: PlanCounts;
  groups: {
    bySubject: SubjectGroup[];
    byGrade: GradeGroup[];
  };
  activity: {
    needsReview: number;
    sentBack: number;
    approvedThisWeek: number;
    recent: RecentPlan[];
  };
}

/**
 * Reduces visible plans to dashboard totals. Pure function over the role-scoped list.
 * @param plans - Plans the signed-in actor may see. Never filtered here.
 * @param now - Current time in milliseconds. Defaults to `Date.now`.
 * @returns Status counts, subject and grade groups, and activity figures.
 */
export function summarizePlans(plans: readonly LessonPlanRecord[], now: number = Date.now()): PlanSummary {
  const counts: PlanCounts = { total: plans.length, draft: 0, submitted: 0, changesRequested: 0, approved: 0 };
  const subjectTotals = new Map<Subject, number>();
  const gradeTotals = new Map<number, number>();
  let approvedThisWeek = 0;

  for (const plan of plans) {
    if (plan.status === 'DRAFT') {
      counts.draft += 1;
    } else if (plan.status === 'SUBMITTED') {
      counts.submitted += 1;
    } else if (plan.status === 'CHANGES_REQUESTED') {
      counts.changesRequested += 1;
    } else {
      counts.approved += 1;
    }

    if (plan.subject !== undefined) {
      subjectTotals.set(plan.subject, (subjectTotals.get(plan.subject) ?? 0) + 1);
    }
    if (plan.grade !== undefined) {
      gradeTotals.set(plan.grade, (gradeTotals.get(plan.grade) ?? 0) + 1);
    }

    if (plan.status === 'APPROVED' && now - Date.parse(plan.updatedAt) <= WEEK_MS) {
      approvedThisWeek += 1;
    }
  }

  const bySubject: SubjectGroup[] = [];
  for (const subject of SUBJECTS) {
    const count = subjectTotals.get(subject);
    if (count !== undefined) {
      bySubject.push({ subject, count });
    }
  }

  const byGrade: GradeGroup[] = [...gradeTotals.entries()]
    .sort(([left], [right]) => left - right)
    .map(([grade, count]) => ({ grade, count }));

  const recent: RecentPlan[] = [...plans]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 4)
    .map((plan) => ({ id: plan.id, title: plan.title ?? '', status: plan.status, updatedAt: plan.updatedAt }));

  return {
    counts,
    groups: { bySubject, byGrade },
    activity: { needsReview: counts.submitted, sentBack: counts.changesRequested, approvedThisWeek, recent },
  };
}
