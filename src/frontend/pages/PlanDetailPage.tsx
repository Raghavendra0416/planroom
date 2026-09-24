'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { LessonPlanRecord, ReviewNoteRecord } from '@/backend/models/types';
import { NoteDialog } from '@/frontend/components/plans/NoteDialog';
import { PlanDocument } from '@/frontend/components/plans/PlanDocument';
import { DocumentSkeleton } from '@/frontend/components/plans/Skeleton';
import { Timeline } from '@/frontend/components/plans/Timeline';
import { BackButton } from '@/frontend/components/ui/BackButton';
import { Button } from '@/frontend/components/ui/button';
import {
  approve,
  approveFail,
  backToPlans,
  comment,
  commentFail,
  edit,
  emptyNote,
  forbidden,
  genericError,
  notFound,
  remove,
  removeFail,
  reopen,
  reopenFail,
  retry,
  sendBack,
  sendBackFail,
  submit,
  submitFail,
} from '@/frontend/copy';
import type { SessionActor } from '@/frontend/contexts/SessionContext';
import { useSession } from '@/frontend/contexts/SessionContext';
import { useToast } from '@/frontend/contexts/ToastContext';
import { getPlan, removePlan, reviewPlan, submitPlan } from '@/frontend/services/plans';

type NoteAction = 'request_changes' | 'reopen' | 'comment';

type Load =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'ready'; plan: LessonPlanRecord; notes: ReviewNoteRecord[] };

const NOTE_LABEL: Record<NoteAction, string> = {
  request_changes: sendBack,
  reopen,
  comment,
};

const NOTE_FAIL: Record<NoteAction, string> = {
  request_changes: sendBackFail,
  reopen: reopenFail,
  comment: commentFail,
};

/**
 * Plan document, timeline, and the actions this role can take.
 * @param props - Detail props.
 * @param props.planId - Lesson plan id.
 * @returns The plan page, or a not-found or forbidden sentence with no body.
 */
export function PlanDetailPage({ planId }: { planId: string }) {
  const router = useRouter();
  const { actor } = useSession();
  const { show } = useToast();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${planId}\u0000${attempt}`;
  const [seenKey, setSeenKey] = useState(requestKey);
  const [pending, setPending] = useState(false);
  const [noteAction, setNoteAction] = useState<NoteAction | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');

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
      setLoad(loadFrom(result));
    });

    return () => {
      cancelled = true;
    };
  }, [planId, attempt]);

  async function refreshPlan(): Promise<void> {
    const result = await getPlan(planId);
    if (!result.ok) {
      show(genericError);
      return;
    }
    setLoad({ kind: 'ready', plan: result.data.plan, notes: result.data.notes });
  }

  async function onSubmit(): Promise<void> {
    setPending(true);
    const result = await submitPlan(planId);
    setPending(false);
    if (!result.ok) {
      show(submitFail);
      return;
    }
    await refreshPlan();
  }

  async function onApprove(): Promise<void> {
    setPending(true);
    const result = await reviewPlan(planId, 'approve');
    setPending(false);
    if (!result.ok) {
      show(approveFail);
      return;
    }
    await refreshPlan();
  }

  async function onRemove(): Promise<void> {
    setPending(true);
    const result = await removePlan(planId);
    setPending(false);
    if (!result.ok) {
      show(removeFail);
      return;
    }
    router.push('/plans');
  }

  function openNote(action: NoteAction): void {
    setNoteAction(action);
    setNote('');
    setNoteError('');
  }

  function closeNote(): void {
    setNoteAction(null);
    setNote('');
    setNoteError('');
  }

  async function confirmNote(): Promise<void> {
    if (!noteAction) {
      return;
    }
    if (note.trim() === '') {
      setNoteError(emptyNote);
      return;
    }

    setPending(true);
    const result = await reviewPlan(planId, noteAction, note);
    setPending(false);
    if (!result.ok) {
      if (result.fields.note) {
        setNoteError(result.fields.note);
      }
      show(NOTE_FAIL[noteAction]);
      return;
    }
    closeNote();
    await refreshPlan();
  }

  if (load.kind === 'loading') {
    return (
      <div aria-busy="true" className="plan-page">
        <DocumentSkeleton />
      </div>
    );
  }

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

  const actions = actor ? detailActions(load.plan, actor) : null;

  return (
    <div className="plan-page">
      <div className="page-top">
        <BackButton fallbackHref="/plans" label={backToPlans} />
      </div>
      <PlanDocument plan={load.plan} titleHref={actions?.edit ? `/plans/${load.plan.id}/edit` : undefined} />
      {actions ? (
        <div className="plan-actions">
          {actions.edit ? (
            <Button href={`/plans/${load.plan.id}/edit`} type="button">
              {edit}
            </Button>
          ) : null}
          {actions.submit ? (
            <Button disabled={pending} type="button" onClick={() => void onSubmit()}>
              {submit}
            </Button>
          ) : null}
          {actions.approve ? (
            <Button disabled={pending} type="button" onClick={() => void onApprove()}>
              {approve}
            </Button>
          ) : null}
          {actions.sendBack ? (
            <Button disabled={pending} type="button" variant="quiet" onClick={() => openNote('request_changes')}>
              {sendBack}
            </Button>
          ) : null}
          {actions.reopen ? (
            <Button disabled={pending} type="button" variant="quiet" onClick={() => openNote('reopen')}>
              {reopen}
            </Button>
          ) : null}
          {actions.comment ? (
            <Button disabled={pending} type="button" variant="quiet" onClick={() => openNote('comment')}>
              {comment}
            </Button>
          ) : null}
          {actions.remove ? (
            <Button disabled={pending} type="button" variant="quiet" onClick={() => void onRemove()}>
              {remove}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Timeline notes={load.notes} />
      {noteAction ? (
        <NoteDialog
          error={noteError}
          label={NOTE_LABEL[noteAction]}
          note={note}
          pending={pending}
          onConfirm={() => void confirmNote()}
          onNoteChange={(value) => {
            setNote(value);
            if (noteError) {
              setNoteError('');
            }
          }}
          onOpenChange={(open) => {
            if (!open && !pending) {
              closeNote();
            }
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Maps a plan response to the detail page state.
 * @param result - Service result.
 * @returns A ready plan, or the failure kind the page renders.
 */
function loadFrom(result: Awaited<ReturnType<typeof getPlan>>): Load {
  if (!result.ok) {
    if (result.status === 404) {
      return { kind: 'missing' };
    }
    if (result.status === 403) {
      return { kind: 'forbidden' };
    }
    return { kind: 'error' };
  }
  return { kind: 'ready', plan: result.data.plan, notes: result.data.notes };
}

/**
 * Actions visible for this actor and status. Hiding one is not the permission check.
 * @param plan - Open plan.
 * @param actor - Signed-in user.
 * @returns Which controls to show. Approve is omitted on the author's own submitted plan.
 */
function detailActions(plan: LessonPlanRecord, actor: SessionActor): {
  submit: boolean;
  approve: boolean;
  sendBack: boolean;
  reopen: boolean;
  comment: boolean;
  remove: boolean;
  edit: boolean;
} {
  const owns = plan.authorId.toLowerCase() === actor.id.toLowerCase();
  const hod = actor.role === 'HOD';
  const editable =
    owns && (plan.status === 'DRAFT' || plan.status === 'SUBMITTED' || plan.status === 'CHANGES_REQUESTED');

  return {
    submit: editable,
    approve: hod && !owns && plan.status === 'SUBMITTED',
    sendBack: hod && plan.status === 'SUBMITTED',
    reopen: hod && plan.status === 'APPROVED',
    comment: hod,
    remove: hod || (owns && plan.status !== 'APPROVED'),
    edit: editable,
  };
}
