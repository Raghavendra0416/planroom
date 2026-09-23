import Link from 'next/link';
import type { LessonPlanRecord } from '@/backend/models/types';
import { subjectLabel } from '@/frontend/components/plans/labels';
import { StatusMark } from '@/frontend/components/plans/StatusMark';
import {
  fieldActivities,
  fieldDuration,
  fieldGrade,
  fieldObjectives,
  fieldResources,
  fieldSubject,
  fieldTopic,
} from '@/frontend/copy';

/**
 * Plan set as a document, about 65 characters wide.
 * @param props - Document props.
 * @param props.plan - Plan to read. Empty optional fields are omitted.
 * @param props.titleHref - When set, the title opens this URL. Used for the edit form.
 * @returns The plan title, status, and present fields.
 */
export function PlanDocument({ plan, titleHref }: { plan: LessonPlanRecord; titleHref?: string }) {
  const title = plan.title ?? '';

  return (
    <article className="plan-document">
      <h1>{titleHref && title !== '' ? <Link href={titleHref}>{title}</Link> : title}</h1>
      {titleHref && title === '' ? (
        <Link href={titleHref}>
          <StatusMark status={plan.status} />
        </Link>
      ) : (
        <StatusMark status={plan.status} />
      )}
      {plan.subject ? <Field label={fieldSubject} value={subjectLabel(plan.subject)} /> : null}
      {plan.grade !== undefined ? <p>{`${fieldGrade} ${plan.grade}`}</p> : null}
      {plan.durationMinutes !== undefined ? <Field label={fieldDuration} value={String(plan.durationMinutes)} /> : null}
      {plan.topic ? <Field label={fieldTopic} value={plan.topic} /> : null}
      {plan.objectives ? <Field label={fieldObjectives} value={plan.objectives} /> : null}
      {plan.activities ? <Field label={fieldActivities} value={plan.activities} /> : null}
      {plan.resources ? <Field label={fieldResources} value={plan.resources} /> : null}
    </article>
  );
}

/**
 * One labelled block in the plan document.
 * @param props - Field props.
 * @param props.label - Field name from the copy table.
 * @param props.value - Stored text or number for that field.
 * @returns The label and the value.
 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="plan-kicker">{label}</span>
      {value}
    </p>
  );
}
