'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import type { LessonPlanRecord, PlanStatus } from '@/backend/models/types';
import { CategorySuggestions } from '@/frontend/components/plans/CategorySuggestions';
import { FieldError } from '@/frontend/components/plans/FieldError';
import { planFailureToast, subjectOptions } from '@/frontend/components/plans/labels';
import { DocumentSkeleton } from '@/frontend/components/plans/Skeleton';
import { StatusMark } from '@/frontend/components/plans/StatusMark';
import { BackButton } from '@/frontend/components/ui/BackButton';
import { Button } from '@/frontend/components/ui/button';
import { SelectField } from '@/frontend/components/ui/select';
import {
  aiIntro,
  backToPlan,
  backToPlans,
  dismissAllActivities,
  dismissAllObjectives,
  dismissAllResources,
  dismissAllSuggestions,
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
  insertAllActivities,
  insertAllObjectives,
  insertAllResources,
  newPlan,
  notFound,
  retry,
  saveDraft,
  saveFail,
  saveFailFields,
  savedToDraft,
  saveSubmit,
  submitFail,
  submitFailFields,
  suggest,
  suggestMoreActivities,
  suggestMoreObjectives,
  suggestMoreResources,
} from '@/frontend/copy';
import { useSession } from '@/frontend/contexts/SessionContext';
import { useToast } from '@/frontend/contexts/ToastContext';
import { applySuggestionPreview, useLessonSuggestions, type SuggestionCategory } from '@/frontend/hooks/useLessonSuggestions';
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
 * Create and edit use the same form. Lesson suggestions preview lists and do not save.
 * @param props - Form props.
 * @param props.planId - Lesson plan id when editing. Omit it for a new plan.
 * @returns The plan form, or a not-found or forbidden sentence when edit is closed.
 */
export function PlanFormPage({ planId }: { planId?: string }) {
  if (!planId) {
    return <NewPlan />;
  }
  return <EditPlan planId={planId} />;
}

/**
 * New-plan form for teachers. HOD accounts never see the form and go to the queue.
 * The skeleton stays up while the session is still loading.
 * @returns The editor, a skeleton, or nothing while redirecting.
 */
function NewPlan() {
  const { actor, ready } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && actor?.role === 'HOD') {
      router.replace('/hod');
    }
  }, [ready, actor, router]);

  if (!ready) {
    return (
      <div aria-busy="true" className="plan-page">
        <DocumentSkeleton />
      </div>
    );
  }

  if (actor?.role === 'HOD') {
    return null;
  }

  return <PlanEditor heading={newPlan} />;
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
      <div className="plan-page">
        <div className="page-top">
          <BackButton fallbackHref="/plans" label={backToPlans} />
        </div>
        <p>{notFound}</p>
      </div>
    );
  }

  if (load.kind === 'forbidden') {
    return (
      <div className="plan-page">
        <div className="page-top">
          <BackButton fallbackHref="/plans" label={backToPlans} />
        </div>
        <p>{forbidden}</p>
      </div>
    );
  }

  if (load.kind === 'error') {
    return (
      <div className="plan-page">
        <div className="page-top">
          <BackButton fallbackHref="/plans" label={backToPlans} />
        </div>
        <p>{genericError}</p>
        <Button type="button" onClick={() => setAttempt((current) => current + 1)}>
          {retry}
        </Button>
      </div>
    );
  }

  if (!ready || load.kind === 'loading') {
    return (
      <div aria-busy="true" className="plan-page">
        <DocumentSkeleton />
      </div>
    );
  }

  if (!actor) {
    return <ClosedPlan plan={load.plan} />;
  }

  if (!ownsPlan(load.plan, actor.id)) {
    return (
      <div className="plan-page">
        <div className="page-top">
          <BackButton fallbackHref="/plans" label={backToPlans} />
        </div>
        <p>{forbidden}</p>
      </div>
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
    <div className="plan-page">
      <div className="page-top">
        <BackButton fallbackHref={`/plans/${plan.id}`} label={backToPlan} />
      </div>
      {plan.title ? (
        <h1>
          <Link href={`/plans/${plan.id}`}>{plan.title}</Link>
        </h1>
      ) : null}
      <StatusMark status={plan.status} />
    </div>
  );
}

/**
 * Savable plan form. Save draft stays quiet, except a submitted edit returns to draft. Save and submit is the primary action.
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
  const [moreBatch, setMoreBatch] = useState<Record<SuggestionCategory, number>>({
    objectives: 0,
    activities: 0,
    resources: 0,
  });
  const [visible, setVisible] = useState<Record<SuggestionCategory, string[]>>({
    objectives: [],
    activities: [],
    resources: [],
  });
  const [categoryGone, setCategoryGone] = useState<Record<SuggestionCategory, boolean>>({
    objectives: false,
    activities: false,
    resources: false,
  });
  const {
    canSuggest,
    suggesting,
    notice,
    previews,
    morePending,
    suggest: requestLesson,
    suggestMoreFor,
    consumeCategory,
    dismissAll,
  } = useLessonSuggestions();

  function update(key: keyof PlanFormState, value: string): void {
    setForm((current) => ({ ...current, [key]: value }));
    setFields((current) => {
      const fieldKey = key === 'duration' ? 'durationMinutes' : key;
      if (current[fieldKey] === undefined) {
        return current;
      }
      const rest = { ...current };
      delete rest[fieldKey];
      return rest;
    });
  }

  function reportFailure(fallback: string, named: string, resultFields: Record<string, string>): void {
    setFields(resultFields);
    show(planFailureToast(fallback, named, resultFields));
    focusFirstInvalid(resultFields);
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
        reportFailure(submitFail, submitFailFields, created.fields);
        return;
      }
      router.push(`/plans/${created.data.id}`);
      return;
    }

    if (!planId) {
      const created = await createPlan(body);
      setPending(false);
      if (!created.ok) {
        reportFailure(saveFail, saveFailFields, created.fields);
        return;
      }
      router.push(`/plans/${created.data.id}/edit`);
      return;
    }

    const saved = await savePlan(planId, body);
    if (!saved.ok) {
      setPending(false);
      reportFailure(intent === 'submit' ? submitFail : saveFail, intent === 'submit' ? submitFailFields : saveFailFields, saved.fields);
      return;
    }

    if (intent === 'draft') {
      const returnedToDraft = status === 'SUBMITTED';
      setPending(false);
      if (returnedToDraft) {
        show(savedToDraft);
        router.push(`/plans/${planId}`);
      }
      return;
    }

    const submitted = await submitPlan(planId);
    setPending(false);
    if (!submitted.ok) {
      reportFailure(submitFail, submitFailFields, submitted.fields);
      return;
    }
    router.push(`/plans/${planId}`);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void save('submit');
  }

  function suggestInput(): SuggestRequest {
    const input: SuggestRequest = { topic: form.topic, subject: form.subject };
    if (form.grade !== '') {
      input.grade = Number(form.grade);
    }
    if (form.duration !== '') {
      input.durationMinutes = Number(form.duration);
    }
    return input;
  }

  async function onSuggest(): Promise<void> {
    setFields({});
    const result = await requestLesson(suggestInput());
    if (!result.ok) {
      setFields(result.fields);
      return;
    }
    setMoreBatch({ objectives: 0, activities: 0, resources: 0 });
    setVisible({ objectives: result.data.objectives, activities: result.data.activities, resources: result.data.resources });
    setCategoryGone({ objectives: false, activities: false, resources: false });
  }

  async function onSuggestMore(category: SuggestionCategory): Promise<void> {
    setFields({});
    const result = await suggestMoreFor(category, suggestInput());
    if (!result.ok) {
      setFields(result.fields);
      return;
    }
    const lines = result.data;
    setCategoryGone((current) => ({ ...current, [category]: false }));
    setMoreBatch((current) => ({ ...current, [category]: current[category] + 1 }));
    setVisible((current) => ({ ...current, [category]: lines }));
  }

  function markSeen(category: SuggestionCategory, lines: readonly string[]): void {
    setVisible((current) => {
      const seen = new Set(lines.map((line) => line.trim().toLowerCase()));
      return { ...current, [category]: current[category].filter((line) => !seen.has(line.trim().toLowerCase())) };
    });
  }

  function insertSuggestions(category: SuggestionCategory, lines: readonly string[]): boolean {
    const next = applySuggestionPreview(category, form[category], lines);
    if (next.error) {
      const message = next.error;
      setFields((current) => ({ ...current, [category]: message }));
      return false;
    }
    const value = next.value;
    setForm((current) => ({ ...current, [category]: value }));
    setFields((current) => {
      if (current[category] === undefined) {
        return current;
      }
      const rest = { ...current };
      delete rest[category];
      return rest;
    });
    return true;
  }

  function onCategoryConsumed(category: SuggestionCategory): void {
    setCategoryGone((current) => ({ ...current, [category]: true }));
    setVisible((current) => ({ ...current, [category]: [] }));
    consumeCategory(category);
  }

  function onDismissAllSuggestions(): void {
    setVisible({ objectives: [], activities: [], resources: [] });
    setCategoryGone({ objectives: true, activities: true, resources: true });
    dismissAll();
  }

  const hasAnySuggestions =
    visible.objectives.length > 0 || visible.activities.length > 0 || visible.resources.length > 0;
  const introId = useId();
  const editorBack = planId ? { fallbackHref: `/plans/${planId}`, label: backToPlan } : { fallbackHref: '/plans', label: backToPlans };

  return (
    <div className="plan-page">
      <div className="page-top">
        <BackButton fallbackHref={editorBack.fallbackHref} label={editorBack.label} />
      </div>
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
            describedBy={fields.subject ? 'plan-subject-error' : undefined}
            id="plan-subject"
            invalid={Boolean(fields.subject)}
            options={subjectOptions()}
            value={form.subject}
            onValueChange={(value) => update('subject', value)}
          />
          <FieldError id="plan-subject-error" message={fields.subject} />
        </div>
        <div className="field">
          <SelectField
            allowEmpty
            caption={fieldGrade}
            describedBy={fields.grade ? 'plan-grade-error' : undefined}
            id="plan-grade"
            invalid={Boolean(fields.grade)}
            options={GRADE_OPTIONS}
            value={form.grade}
            onValueChange={(value) => update('grade', value)}
          />
          <FieldError id="plan-grade-error" message={fields.grade} />
        </div>
        <div className="field">
          <SelectField
            allowEmpty
            caption={fieldDuration}
            describedBy={fields.durationMinutes ? 'plan-duration-error' : undefined}
            id="plan-duration"
            invalid={Boolean(fields.durationMinutes)}
            options={DURATION_OPTIONS}
            value={form.duration}
            onValueChange={(value) => update('duration', value)}
          />
          <FieldError id="plan-duration-error" message={fields.durationMinutes} />
        </div>
        <TextField
          error={fields.topic}
          id="plan-topic"
          label={fieldTopic}
          value={form.topic}
          onChange={(value) => update('topic', value)}
        />
        <div className="suggest-line">
          <Button
            ariaLabel={!canSuggest && notice ? `${suggest}. ${notice}` : undefined}
            disabled={!canSuggest}
            type="button"
            variant="quiet"
            onClick={() => void onSuggest()}
          >
            {suggesting ? `${suggest}…` : suggest}
          </Button>
          {notice ? (
            <p aria-live="polite" role="status">
              {notice}
            </p>
          ) : null}
        </div>
        {hasAnySuggestions ? (
          <section aria-labelledby={introId} className="suggest-line">
            <p id={introId}>{aiIntro}</p>
            <Button type="button" variant="quiet" onClick={onDismissAllSuggestions}>
              {dismissAllSuggestions}
            </Button>
          </section>
        ) : null}
        <TextField
          multiline
          error={fields.objectives}
          id="plan-objectives"
          label={fieldObjectives}
          value={form.objectives}
          onChange={(value) => update('objectives', value)}
        />
        <CategoryBlock
          category="objectives"
          lines={visible.objectives}
          batch={moreBatch.objectives}
          hidden={categoryGone.objectives}
          moreDisabled={morePending.objectives || suggesting}
          insertAllLabel={insertAllObjectives}
          dismissAllLabel={dismissAllObjectives}
          suggestMoreLabel={suggestMoreObjectives}
          onInsert={insertSuggestions}
          onSeen={markSeen}
          onConsumed={onCategoryConsumed}
          onSuggestMore={(category) => void onSuggestMore(category)}
        />
        <TextField
          multiline
          error={fields.activities}
          id="plan-activities"
          label={fieldActivities}
          value={form.activities}
          onChange={(value) => update('activities', value)}
        />
        <CategoryBlock
          category="activities"
          lines={visible.activities}
          batch={moreBatch.activities}
          hidden={categoryGone.activities}
          moreDisabled={morePending.activities || suggesting}
          insertAllLabel={insertAllActivities}
          dismissAllLabel={dismissAllActivities}
          suggestMoreLabel={suggestMoreActivities}
          onInsert={insertSuggestions}
          onSeen={markSeen}
          onConsumed={onCategoryConsumed}
          onSuggestMore={(category) => void onSuggestMore(category)}
        />
        <TextField
          multiline
          error={fields.resources}
          id="plan-resources"
          label={fieldResources}
          value={form.resources}
          onChange={(value) => update('resources', value)}
        />
        <CategoryBlock
          category="resources"
          lines={visible.resources}
          batch={moreBatch.resources}
          hidden={categoryGone.resources}
          moreDisabled={morePending.resources || suggesting}
          insertAllLabel={insertAllResources}
          dismissAllLabel={dismissAllResources}
          suggestMoreLabel={suggestMoreResources}
          onInsert={insertSuggestions}
          onSeen={markSeen}
          onConsumed={onCategoryConsumed}
          onSuggestMore={(category) => void onSuggestMore(category)}
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
    </div>
  );
}

const GRADE_OPTIONS = [6, 7, 8, 9, 10, 11, 12].map((grade) => ({
  value: String(grade),
  label: String(grade),
}));

/**
 * Backend field key to the id of its control. `durationMinutes` is the Duration select.
 */
const PLAN_FIELD_IDS: Record<string, string> = {
  title: 'plan-title',
  subject: 'plan-subject',
  grade: 'plan-grade',
  durationMinutes: 'plan-duration',
  topic: 'plan-topic',
  objectives: 'plan-objectives',
  activities: 'plan-activities',
  resources: 'plan-resources',
};

const FIELD_ORDER = ['title', 'subject', 'grade', 'durationMinutes', 'topic', 'objectives', 'activities', 'resources'];

/**
 * Moves focus to the first failing control so keyboard and screen-reader users
 * land on the field the toast names. Radix select triggers focus like inputs.
 * @param resultFields - Field messages from the API failure.
 */
function focusFirstInvalid(resultFields: Record<string, string>): void {
  for (const key of FIELD_ORDER) {
    if (resultFields[key] === undefined || PLAN_FIELD_IDS[key] === undefined) {
      continue;
    }
    document.getElementById(PLAN_FIELD_IDS[key])?.focus();
    return;
  }
}

const CATEGORIES: SuggestionCategory[] = ['objectives', 'activities', 'resources'];

/**
 * One field's suggestion block rendered directly beneath that field.
 * @param props - Category lines plus the editor callbacks that own them.
 * @returns The category list, or nothing when it has no visible rows.
 */
function CategoryBlock({
  category,
  lines,
  batch,
  hidden,
  moreDisabled,
  insertAllLabel,
  dismissAllLabel,
  suggestMoreLabel,
  onInsert,
  onSeen,
  onConsumed,
  onSuggestMore,
}: {
  category: SuggestionCategory;
  lines: string[];
  batch: number;
  hidden: boolean;
  moreDisabled: boolean;
  insertAllLabel: string;
  dismissAllLabel: string;
  suggestMoreLabel: string;
  onInsert: (category: SuggestionCategory, lines: readonly string[]) => boolean;
  onSeen: (category: SuggestionCategory, lines: readonly string[]) => void;
  onConsumed: (category: SuggestionCategory) => void;
  onSuggestMore: (category: SuggestionCategory) => void;
}): ReactNode {
  if (hidden || lines.length === 0) {
    return null;
  }
  return (
    <div className="field-suggestions">
      <CategorySuggestions
        category={category}
        lines={lines}
        batch={batch}
        moreDisabled={moreDisabled}
        onInsert={onInsert}
        onSeen={onSeen}
        onConsumed={() => onConsumed(category)}
        insertAllLabel={insertAllLabel}
        dismissAllLabel={dismissAllLabel}
        suggestMoreLabel={suggestMoreLabel}
        onSuggestMore={() => onSuggestMore(category)}
      />
    </div>
  );
}

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
  const errorId = error ? `${id}-error` : undefined;

  return (
    <label htmlFor={id}>
      {label}
      {multiline ? (
        <textarea
          aria-describedby={errorId}
          aria-invalid={invalid}
          className={className}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          aria-describedby={errorId}
          aria-invalid={invalid}
          className={className}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <FieldError id={errorId} message={error} />
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
 * @returns True for the owner's draft, submitted, or sent-back plan.
 */
function canEdit(plan: LessonPlanRecord): boolean {
  return plan.status === 'DRAFT' || plan.status === 'SUBMITTED' || plan.status === 'CHANGES_REQUESTED';
}
