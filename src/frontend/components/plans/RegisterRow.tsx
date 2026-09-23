import Link from 'next/link';
import type { LessonPlanRecord } from '@/backend/models/types';
import { subjectLabel } from '@/frontend/components/plans/labels';
import { StatusMark } from '@/frontend/components/plans/StatusMark';
import { fieldGrade } from '@/frontend/copy';

/**
 * One register row. The whole row opens the plan. It is not a card.
 * @param props - Row props.
 * @param props.plan - Plan to show. A missing title, subject, or grade leaves that cell empty.
 * @returns A link row with title, subject, grade, and status.
 */
export function RegisterRow({ plan }: { plan: LessonPlanRecord }) {
  return (
    <Link className="register-row" href={`/plans/${plan.id}`}>
      <span className="register-title">{plan.title ?? ''}</span>
      <span className="register-meta">{plan.subject ? subjectLabel(plan.subject) : ''}</span>
      <span className="register-meta">{plan.grade === undefined ? '' : `${fieldGrade} ${plan.grade}`}</span>
      <StatusMark status={plan.status} />
    </Link>
  );
}
