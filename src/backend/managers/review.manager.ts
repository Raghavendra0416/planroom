import { lessonPlanModel } from '@/backend/models/lesson-plan.model';
import { reviewNoteModel } from '@/backend/models/review-note.model';
import type { Actor, LessonPlanRecord, NoteKind, PlanStatus, ReviewNoteRecord } from '@/backend/models/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/backend/utils/errors';
import {
  cannotRead,
  illegalStatusMessage,
  isStoredId,
  missingPlanMessage,
  planStatus,
  rethrowDomain,
  sameId,
  toLessonPlanRecord,
  toReviewNoteRecord,
} from '@/backend/managers/plan-shape';

type LessonPlanModel = ReturnType<typeof lessonPlanModel>;
type ReviewNoteModel = ReturnType<typeof reviewNoteModel>;

const EMPTY_NOTE = 'Write a note first.';
const LONG_NOTE = 'A note must be at most 1000 characters.';
const CANNOT_REVIEW = 'You cannot review this plan.';
const CANNOT_APPROVE_OWN = 'You cannot approve your own plan.';

/**
 * Review rules for send back, approve, reopen, comment, and the note list.
 */
export class ReviewManager {
  /**
   * @param plans - Compiled lesson plan model.
   * @param notes - Compiled review note model.
   */
  constructor(
    private readonly plans: LessonPlanModel,
    private readonly notes: ReviewNoteModel,
  ) {}

  /**
   * Sends a submitted plan back to the author with the HOD's note.
   * @param actor - Signed-in head of department.
   * @param planId - Lesson plan id.
   * @param note - Note the HOD typed. It is trimmed and required.
   * @returns The plan now sent back.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When the actor is not a head of department.
   * @throws {ConflictError} When the plan is not submitted.
   * @throws {ValidationError} When the note is empty or longer than 1000 characters.
   */
  async requestChanges(actor: Actor, planId: string, note: string): Promise<LessonPlanRecord> {
    // 1. Load the plan and reject a missing or soft-deleted row.
    const plan = await this.load(planId);

    // 2. Only an HOD may send a submitted plan back. An illegal jump writes no note.
    this.requireHod(actor);
    if (planStatus(plan.status) !== 'SUBMITTED') {
      throw new ConflictError(illegalStatusMessage);
    }

    // 3. Require a trimmed note before the status changes.
    const body = trimmedNote(note);

    // 4. Mark it sent back and store that note, putting the old status back if the insert fails.
    return this.commit(plan, 'CHANGES_REQUESTED', 'CHANGES_REQUESTED', body, actor.id);
  }

  /**
   * Approves a submitted plan when the HOD is not the author.
   * @param actor - Signed-in head of department.
   * @param planId - Lesson plan id.
   * @returns The approved plan.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When the actor is not a head of department or is the author.
   * @throws {ConflictError} When the plan is not submitted.
   */
  async approve(actor: Actor, planId: string): Promise<LessonPlanRecord> {
    // 1. Load the plan and reject a missing or soft-deleted row.
    const plan = await this.load(planId);

    // 2. Only an HOD may approve, never their own plan. An illegal jump writes no note.
    this.requireHod(actor);
    if (planStatus(plan.status) !== 'SUBMITTED') {
      throw new ConflictError(illegalStatusMessage);
    }
    if (sameId(plan.authorId, actor.id)) {
      throw new ForbiddenError(CANNOT_APPROVE_OWN);
    }

    // 3. Mark it approved and store the approval note, putting the old status back if the insert fails.
    return this.commit(plan, 'APPROVED', 'APPROVED', 'This plan is approved.', actor.id);
  }

  /**
   * Reopens an approved plan into sent back with the HOD's note.
   * @param actor - Signed-in head of department.
   * @param planId - Lesson plan id.
   * @param note - Note the HOD typed. It is trimmed and required.
   * @returns The plan now sent back.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When the actor is not a head of department.
   * @throws {ConflictError} When the plan is not approved.
   * @throws {ValidationError} When the note is empty or longer than 1000 characters.
   */
  async reopen(actor: Actor, planId: string, note: string): Promise<LessonPlanRecord> {
    // 1. Load the plan and reject a missing or soft-deleted row.
    const plan = await this.load(planId);

    // 2. Only an HOD may reopen an approved plan. An illegal jump writes no note.
    this.requireHod(actor);
    if (planStatus(plan.status) !== 'APPROVED') {
      throw new ConflictError(illegalStatusMessage);
    }

    // 3. Require a trimmed note before the status changes.
    const body = trimmedNote(note);

    // 4. Mark it sent back and store the reopen note, putting the old status back if the insert fails.
    return this.commit(plan, 'CHANGES_REQUESTED', 'REOPENED', body, actor.id);
  }

  /**
   * Stores one comment on any non-deleted plan and does not change status.
   * @param actor - Signed-in head of department.
   * @param planId - Lesson plan id.
   * @param note - Comment the HOD typed. It is trimmed and required.
   * @returns The stored comment.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When the actor is not a head of department.
   * @throws {ValidationError} When the note is empty or longer than 1000 characters.
   */
  async comment(actor: Actor, planId: string, note: string): Promise<ReviewNoteRecord> {
    // 1. Load the plan and reject a missing or soft-deleted row.
    const plan = await this.load(planId);

    // 2. Only an HOD may comment, and the status stays as it is.
    this.requireHod(actor);
    const body = trimmedNote(note);

    // 3. Store one comment note.
    try {
      const created = await this.notes.create({
        planId: plan._id,
        authorId: actor.id,
        kind: 'COMMENT',
        body,
      });
      return toReviewNoteRecord(created);
    } catch (error) {
      rethrowDomain(error);
    }
  }

  /**
   * Lists one plan's notes, oldest first, after the same read check as opening the plan.
   * @param actor - Signed-in teacher or head of department.
   * @param planId - Lesson plan id.
   * @returns The plan's notes from oldest to newest.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When a teacher opens someone else's plan.
   */
  async listNotes(actor: Actor, planId: string): Promise<ReviewNoteRecord[]> {
    // 1. Use the same read check as opening the plan.
    const plan = await this.load(planId);
    const denial = cannotRead(actor.role, plan.authorId, actor.id);
    if (denial) {
      throw new ForbiddenError(denial);
    }

    // 2. Return that plan's notes, oldest first.
    const notes = await this.notes.find({ planId: plan._id }).sort({ createdAt: 1, _id: 1 }).lean();
    return notes.map((note) => toReviewNoteRecord(note));
  }

  /**
   * Rejects anyone who is not a head of department.
   * @param actor - Signed-in caller.
   * @throws {ForbiddenError} When the actor is a teacher.
   */
  private requireHod(actor: Actor): void {
    if (actor.role !== 'HOD') {
      throw new ForbiddenError(CANNOT_REVIEW);
    }
  }

  /**
   * Loads one active plan.
   * @param planId - Lesson plan id from the caller.
   * @returns The stored plan.
   * @throws {NotFoundError} When the id is invalid or the plan is missing or soft-deleted.
   */
  private async load(planId: string) {
    if (!isStoredId(planId)) {
      throw new NotFoundError(missingPlanMessage);
    }

    const plan = await this.plans.findOne({ _id: planId, deletedAt: null }).lean();
    if (!plan) {
      throw new NotFoundError(missingPlanMessage);
    }
    return plan;
  }

  /**
   * Sets the next status and inserts one note, then restores the old status if the note insert throws.
   * @param plan - Active plan already checked for role and status.
   * @param next - Status to store.
   * @param kind - Note kind for this edge.
   * @param body - Trimmed note body.
   * @param authorId - Head of department id.
   * @returns The updated plan.
   * @throws {ConflictError} When the status changed before the write.
   */
  private async commit(
    plan: { _id: unknown; status?: unknown },
    next: PlanStatus,
    kind: NoteKind,
    body: string,
    authorId: string,
  ): Promise<LessonPlanRecord> {
    const previous = planStatus(plan.status);
    // 1. Set the next status only while the previous status is still current.
    let updated: object | null;
    try {
      updated = await this.plans
        .findOneAndUpdate(
          { _id: plan._id, deletedAt: null, status: previous },
          { $set: { status: next } },
          { returnDocument: 'after' },
        )
        .lean();
    } catch (error) {
      rethrowDomain(error);
    }
    if (!updated) {
      throw new ConflictError(illegalStatusMessage);
    }

    // 2. Store one note, and put the previous status back if that insert throws.
    try {
      await this.notes.create({
        planId: String(plan._id),
        authorId,
        kind,
        body,
      });
    } catch (error) {
      await this.plans.updateOne({ _id: plan._id, deletedAt: null }, { $set: { status: previous } });
      throw error;
    }

    return toLessonPlanRecord(updated);
  }
}

/**
 * Trims a review note and rejects an empty or oversized body.
 * @param note - Text the head of department typed.
 * @returns The trimmed note.
 * @throws {ValidationError} When the trimmed note is empty or longer than 1000 characters.
 */
function trimmedNote(note: string): string {
  const trimmed = typeof note === 'string' ? note.trim() : '';
  if (trimmed.length === 0) {
    throw new ValidationError({ note: EMPTY_NOTE });
  }
  if (trimmed.length > 1000) {
    throw new ValidationError({ note: LONG_NOTE });
  }
  return trimmed;
}
