'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { LessonPlanRecord, PlanStatus } from '@/backend/models/types';
import { FieldError } from '@/frontend/components/plans/FieldError';
import { subjectOptions } from '@/frontend/components/plans/labels';
import { DocumentSkeleton } from '@/frontend/components/plans/Skeleton';
import { StatusMark } from '@/frontend/components/plans/StatusMark';
import { Button } from '@/frontend/components/ui/button';
import { SelectField } from '@/frontend/components/ui/select';
import {
  dismiss,
  fieldActivities,
  fieldDuration,
  fieldGrade,
  fieldObjectives,
  fieldResources,
  fieldSubject,
  fieldTitle,
  fieldTopic,
  forbidden,
  genericError,
  insertAll,
  insertOne,
  newPlan,
  notFound,
  retry,
  saveDraft,
  saveFail,
  saveSubmit,
  submitFail,
  suggest,
} from '@/frontend/copy';
import { useSession } from '@/frontend/contexts/SessionContext';
import { useToast } from '@/frontend/contexts/ToastContext';
import { applyObjectivePreview, useSuggestObjectives } from '@/frontend/hooks/useSuggestObjectives';
import { createPlan, getPlan, savePlan, submitPlan, type PlanWriteBody } from '@/frontend/services/plans';
import type { SuggestRequest } from '@/frontend/services/ai';

const DURATION_OPTIONS = Array.from({ length: (120 - 15) / 5 + 1 }, (_, index) => {
  const minutes = 15 + index * 5;
  return { value: String(minutes), label: String(minutes) };
});

interface PlanFormState {
  title: string;
  subject: string;
  grade: string;
  duration: string;
  topic: string;
  objectives: string;
  activities: string;
  resources: string;
}

const EMPTY_FORM: PlanFormState = {
  title: '',
  subject: '',
  grade: '',
  duration: '',
  topic: '',
  objectives: '',
  activities: '',
  resources: '',
};

type EditLoad =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'ready'; plan: LessonPlanRecord };

/**
 * Create and edit use the same form. Suggest objectives previews lines and does not save.
 * @param props - Form props.
 * @param props.planId - Lesson plan id when editing. Omit it for a new plan.
 * @returns The plan form, or a not-found or forbidden sentence when edit is closed.
 */
export function PlanFormPage({ planId }: { planId?: string }) {
  if (!planId) {
    return <PlanEditor heading={newPlan} />;
  }
  return <EditPlan planId={planId} />;
}

/**
 * Loads a plan and refuses a savable form when this actor cannot edit it.
 * The skeleton stays up while the session or the plan is still loading.
 * @param props - Edit props.
 * @param props.planId - Lesson plan id.
 * @returns The editor, a skeleton, or the closed-edit message.
 */
function EditPlan({ planId }: { planId: string }) {
  const { actor, ready } = useSession();
  const [load, setLoad] = useState<EditLoad>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${planId}\u0000${attempt}`;
  const [seenKey, setSeenKey] = useState(requestKey);

  if (seenKey !== requestKey) {
    setSeenKey(requestKey);
    setLoad({ kind: 'loading' });
  }

  useEffect(() => {
    let cancelled = false;

    void getPlan(planId).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        if (result.status === 404) {
          setLoad({ kind: 'missing' });
        } else if (result.status === 403) {
          setLoad({ kind: 'forbidden' });
        } else {
          setLoad({ kind: 'error' });
        }
        return;
      }
      setLoad({ kind: 'ready', plan: result.data.plan });
    });

    return () => {
      cancelled = true;
    };
  }, [planId, attempt]);

  if (load.kind === 'missing') {
    return (
      <main className="plan-page">
        <p>{notFound}</p>
      </main>
    );
  }

  if (load.kind === 'forbidden') {
    return (
      <main className="plan-page">
        <p>{forbidden}</p>
      </main>
    );
  }

  if (load.kind === 'error') {
    return (
      <main className="plan-page">
        <p>{genericError}</p>
        <Button type="button" onClick={() => setAttempt((current) => current + 1)}>
          {retry}
        </Button>
      </main>
    );
  }

  if (!ready || load.kind === 'loading') {
    return (
      <main aria-busy="true" className="plan-page">
        <DocumentSkeleton />
      </main>
    );
  }

  if (!actor) {
    return <ClosedPlan plan={load.plan} />;
  }

  if (!ownsPlan(load.plan, actor.id)) {
    return (
      <main className="plan-page">
        <p>{forbidden}</p>
      </main>
    );
  }

  if (!canEdit(load.plan)) {
    return <ClosedPlan plan={load.plan} />;
  }

  return (
    <PlanEditor
      heading={load.plan.title && load.plan.title.length > 0 ? load.plan.title : newPlan}
      initial={formFromPlan(load.plan)}
      planId={planId}
      status={load.plan.status}
    />
  );
}

/**
 * Title and status with no savable form. Used when nobody is signed in, or the owner cannot edit.
 * @param props - Closed plan props.
 * @param props.plan - Loaded plan.
 * @returns The title, when present, and the status mark.
 */
function ClosedPlan({ plan }: { plan: LessonPlanRecord }) {
  return (
    <main className="plan-page">
      {plan.title ? (
        <h1>
          <Link href={`/plans/${plan.id}`}>{plan.title}</Link>
        </h1>
      ) : null}
      <StatusMark status={plan.status} />
    </main>
  );
}

/**
 * Savable plan form. Save draft stays quiet. Save and submit is the primary action.
 * @param props - Editor props.
 * @param props.heading - Page heading.
 * @param props.planId - Present when this save should update a plan.
 * @param props.status - Current status. A sent-back plan must be complete to save.
 * @param props.initial - Field values. A new plan starts empty.
 * @returns The form.
 */
function PlanEditor({
  heading,
  planId,
  status,
  initial = EMPTY_FORM,
}: {
  heading: string;
  planId?: string;
  status?: PlanStatus;
  initial?: PlanFormState;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [form, setForm] = useState(initial);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const {
    canSuggest,
    notice,
    preview,
    suggest: requestObjectives,
    dismiss: clearPreview,
  } = useSuggestObjectives();

  function update(key: keyof PlanFormState, value: string): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(intent: 'draft' | 'submit'): Promise<void> {
    setPending(true);
    setFields({});
    const mode = intent === 'submit' || status === 'CHANGES_REQUESTED' ? 'complete' : 'draft';
    const body = toWriteBody(form, mode);

    if (!planId && intent === 'submit') {
      const created = await createPlan({ ...body, intent: 'submit' });
      setPending(false);
      if (!created.ok) {
        show(submitFail);
        setFields(created.fields);
        return;
      }
      router.push(`/plans/${created.data.id}`);
      return;
    }

    if (!planId) {
      const created = await createPlan(body);
      setPending(false);
      if (!created.ok) {
        show(saveFail);
        setFields(created.fields);
        return;
      }
      router.push(`/plans/${created.data.id}/edit`);
      return;
    }

    const saved = await savePlan(planId, body);
    if (!saved.ok) {
      setPending(false);
      show(intent === 'submit' ? submitFail : saveFail);
      setFields(saved.fields);
      return;
    }

    if (intent === 'draft') {
      setPending(false);
      return;
    }

    const submitted = await submitPlan(planId);
    setPending(false);
    if (!submitted.ok) {
      show(submitFail);
      setFields(submitted.fields);
      return;
    }
    router.push(`/plans/${planId}`);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void save('submit');
  }

  async function onSuggest(): Promise<void> {
    setFields({});
    const input: SuggestRequest = { topic: form.topic, subject: form.subject };
    if (form.grade !== '') {
      input.grade = Number(form.grade);
    }
    if (form.duration !== '') {
      input.durationMinutes = Number(form.duration);
    }
    const result = await requestObjectives(input);
    if (!result.ok) {
      setFields(result.fields);
    }
  }

  function keepLines(lines: readonly string[]): void {
    const next = applyObjectivePreview(form.objectives, lines);
    if (next.error) {
      const objectivesError = next.error;
      setFields((current) => ({ ...current, objectives: objectivesError }));
      return;
    }
    setForm((current) => ({ ...current, objectives: next.objectives }));
    setFields((current) => {
      if (current.objectives === undefined) {
        return current;
      }
      const rest = { ...current };
      delete rest.objectives;
      return rest;
    });
  }

  return (
    <main className="plan-page">
      <h1>{heading}</h1>
      <form className="plan-form" noValidate onSubmit={onSubmit}>
        <TextField
          error={fields.title}
          id="plan-title"
          label={fieldTitle}
          value={form.title}
          onChange={(value) => update('title', value)}
        />
        <div className="field">
          <SelectField
            allowEmpty
            caption={fieldSubject}
            id="plan-subject"
            invalid={Boolean(fields.subject)}
            options={subjectOptions()}
            value={form.subject}
            onValueChange={(value) => update('subject', value)}
          />
          <FieldError message={fields.subject} />
        </div>
        <div className="field">
          <SelectField
            allowEmpty
            caption={fieldGrade}
            id="plan-grade"
            invalid={Boolean(fields.grade)}
            options={GRADE_OPTIONS}
            value={form.grade}
            onValueChange={(value) => update('grade', value)}
          />
          <FieldError message={fields.grade} />
        </div>
        <div className="field">
          <SelectField
            allowEmpty
            caption={fieldDuration}
            id="plan-duration"
            invalid={Boolean(fields.durationMinutes)}
            options={DURATION_OPTIONS}
            value={form.duration}
            onValueChange={(value) => update('duration', value)}
          />
          <FieldError message={fields.durationMinutes} />
        </div>
        <TextField
          error={fields.topic}
          id="plan-topic"
          label={fieldTopic}
          value={form.topic}
          onChange={(value) => update('topic', value)}
        />
        <TextField
          multiline
          error={fields.objectives}
          id="plan-objectives"
          label={fieldObjectives}
          value={form.objectives}
          onChange={(value) => update('objectives', value)}
        />
        <div className="suggest-line">
          <Button disabled={!canSuggest} type="button" variant="quiet" onClick={() => void onSuggest()}>
            {suggest}
          </Button>
          {notice ? <p>{notice}</p> : null}
        </div>
        {preview ? (
          <>
            <ul className="objective-preview">
              {preview.map((line, index) => (
                <li key={`${index}-${line}`}>
                  <span>{line}</span>
                  <Button type="button" variant="quiet" onClick={() => keepLines([line])}>
                    {insertOne}
                  </Button>
                </li>
              ))}
            </ul>
            <div className="objective-actions">
              <Button type="button" variant="quiet" onClick={() => keepLines(preview)}>
                {insertAll}
              </Button>
              <Button type="button" variant="quiet" onClick={clearPreview}>
                {dismiss}
              </Button>
            </div>
          </>
        ) : null}
        <TextField
          multiline
          error={fields.activities}
          id="plan-activities"
          label={fieldActivities}
          value={form.activities}
          onChange={(value) => update('activities', value)}
        />
        <TextField
          multiline
          error={fields.resources}
          id="plan-resources"
          label={fieldResources}
          value={form.resources}
          onChange={(value) => update('resources', value)}
        />
        {fields.form ? <FieldError message={fields.form} /> : null}
        <div className="plan-actions">
          <Button disabled={pending} type="button" variant="quiet" onClick={() => void save('draft')}>
            {saveDraft}
          </Button>
          <Button disabled={pending} type="submit">
            {saveSubmit}
          </Button>
        </div>
      </form>
    </main>
  );
}

const GRADE_OPTIONS = [6, 7, 8, 9, 10, 11, 12].map((grade) => ({
  value: String(grade),
  label: String(grade),
}));

/**
 * Text or multiline field with its error under it.
 * @param props - Field props.
 * @param props.id - Input id.
 * @param props.label - Field name from the copy table.
 * @param props.value - Current text.
 * @param props.error - API message for this field.
 * @param props.onChange - Replaces the text.
 * @param props.multiline - Uses a textarea when the field is long.
 * @returns The labelled control.
 */
function TextField({
  id,
  label,
  value,
  error,
  onChange,
  multiline = false,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}): ReactNode {
  const invalid = error ? true : undefined;
  const className = error ? 'has-error' : undefined;

  return (
    <label htmlFor={id}>
      {label}
      {multiline ? (
        <textarea aria-invalid={invalid} className={className} id={id} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input aria-invalid={invalid} className={className} id={id} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
      <FieldError message={error} />
    </label>
  );
}

/**
 * Copies a stored plan into form fields.
 * @param plan - Plan returned by the API.
 * @returns Empty strings for omitted fields.
 */
function formFromPlan(plan: LessonPlanRecord): PlanFormState {
  return {
    title: plan.title ?? '',
    subject: plan.subject ?? '',
    grade: plan.grade === undefined ? '' : String(plan.grade),
    duration: plan.durationMinutes === undefined ? '' : String(plan.durationMinutes),
    topic: plan.topic ?? '',
    objectives: plan.objectives ?? '',
    activities: plan.activities ?? '',
    resources: plan.resources ?? '',
  };
}

/**
 * Builds the JSON body. Draft saves omit empty text. A complete save sends it so the field can fail.
 * @param form - Current form fields.
 * @param mode - `draft` omits empty text. `complete` sends it.
 * @returns The body passed to create or save.
 */
function toWriteBody(form: PlanFormState, mode: 'draft' | 'complete'): PlanWriteBody {
  const body: PlanWriteBody = { resources: form.resources };
  putText(body, 'title', form.title, mode);
  putText(body, 'topic', form.topic, mode);
  putText(body, 'objectives', form.objectives, mode);
  putText(body, 'activities', form.activities, mode);
  if (form.subject !== '') {
    body.subject = form.subject;
  }
  if (form.grade !== '') {
    body.grade = Number(form.grade);
  }
  if (form.duration !== '') {
    body.durationMinutes = Number(form.duration);
  }
  return body;
}

/**
 * Copies a text field when it should be sent.
 * @param body - Body being built.
 * @param key - Plan text field.
 * @param value - Current text.
 * @param mode - `draft` skips an empty value.
 */
function putText(
  body: PlanWriteBody,
  key: 'title' | 'topic' | 'objectives' | 'activities',
  value: string,
  mode: 'draft' | 'complete',
): void {
  if (value === '' && mode === 'draft') {
    return;
  }
  body[key] = value;
}

/**
 * Reports whether the signed-in user wrote the plan.
 * @param plan - Loaded plan.
 * @param actorId - Signed-in user id.
 * @returns True when the ids match.
 */
function ownsPlan(plan: LessonPlanRecord, actorId: string): boolean {
  return plan.authorId.toLowerCase() === actorId.toLowerCase();
}

/**
 * Reports whether the owner may save this plan.
 * @param plan - Loaded plan.
 * @returns True for the owner's draft or sent-back plan.
 */
function canEdit(plan: LessonPlanRecord): boolean {
  return plan.status === 'DRAFT' || plan.status === 'CHANGES_REQUESTED';
}
