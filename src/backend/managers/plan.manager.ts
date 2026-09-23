import { lessonPlanModel } from '@/backend/models/lesson-plan.model';
import { reviewNoteModel } from '@/backend/models/review-note.model';
import type { Actor, LessonPlanRecord, PlanStatus } from '@/backend/models/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/backend/utils/errors';
import {
  cannotRead,
  illegalStatusMessage,
  isPlanStatus,
  isStoredId,
  isSubject,
  missingPlanMessage,
  planStatus,
  rethrowDomain,
  sameId,
  toLessonPlanRecord,
} from '@/backend/managers/plan-shape';
import {
  readCompletePlan,
  readDraftPlan,
  type CompletePlan,
  type CreatePlanBody,
  type DraftPlan,
  type PlanBody,
} from '@/backend/validation/plan';

type LessonPlanModel = ReturnType<typeof lessonPlanModel>;
type ReviewNoteModel = ReturnType<typeof reviewNoteModel>;

const DRAFT_FIELDS = [
  'title',
  'subject',
  'grade',
  'durationMinutes',
  'topic',
  'objectives',
  'activities',
  'resources',
] as const satisfies readonly (keyof DraftPlan)[];

/**
 * Query for a plan list. Unknown `sort` falls back to `updatedAt`. Unknown status, subject, and grade are ignored.
 */
export interface PlanListQuery {
  q?: string;
  sort?: string;
  status?: string;
  subject?: string;
  grade?: number | string;
}

/**
 * Lesson-plan rules for list, read, save, submit, and soft delete.
 */
export class PlanManager {
  /**
   * @param plans - Compiled lesson plan model.
   * @param notes - Compiled review note model.
   */
  constructor(
    private readonly plans: LessonPlanModel,
    private readonly notes: ReviewNoteModel,
  ) {}

  /**
   * Lists non-deleted plans visible to the actor, newest first.
   * @param actor - Signed-in teacher or head of department.
   * @param query - Optional search, sort, and exact filters.
   * @returns Every matching plan. There is no page.
   */
  async list(actor: Actor, query: PlanListQuery = {}): Promise<LessonPlanRecord[]> {
    // 1. Hide soft-deleted plans. A teacher also sees only their own.
    const filter = listFilter(actor, query);

    // 2. Sort newest first. An unknown sort uses updatedAt.
    const sortKey = query.sort === 'createdAt' ? 'createdAt' : 'updatedAt';
    const docs = await this.plans.find(filter).sort({ [sortKey]: -1, _id: -1 }).lean();

    // 3. Return the records.
    return docs.map((doc) => toLessonPlanRecord(doc));
  }

  /**
   * Opens one non-deleted plan when the actor is allowed to read it.
   * @param actor - Signed-in teacher or head of department.
   * @param planId - Lesson plan id.
   * @returns The plan.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When a teacher opens someone else's plan.
   */
  async get(actor: Actor, planId: string): Promise<LessonPlanRecord> {
    // 1. Load the plan and reject a missing or soft-deleted row.
    const plan = await this.load(planId);

    // 2. A teacher may open only their own plan.
    const denial = cannotRead(actor.role, plan.authorId, actor.id);
    if (denial) {
      throw new ForbiddenError(denial);
    }

    // 3. Return the plan.
    return toLessonPlanRecord(plan);
  }

  /**
   * Creates a draft owned by the actor. `intent: "submit"` also submits that new plan.
   * @param actor - Signed-in author.
   * @param input - Plan fields. Owner fields are ignored.
   * @returns The created plan, submitted when that was the intent.
   * @throws {ValidationError} When a present field does not fit, or a submit is incomplete.
   */
  async create(actor: Actor, input: CreatePlanBody): Promise<LessonPlanRecord> {
    // 1. Reject a present field that does not fit, then insert a draft owned by the actor.
    const draft = readDraftPlan(input);
    const created = await this.insertDraft(actor, draft);

    // 2. Submit in this same call when asked, and delete the new row if it is not complete.
    if (input.intent !== 'submit') {
      return toLessonPlanRecord(created);
    }

    try {
      return await this.submit(actor, created._id.toString());
    } catch (error) {
      if (error instanceof ValidationError) {
        await this.plans.deleteOne({ _id: created._id });
      }
      throw error;
    }
  }

  /**
   * Saves the owner's plan without changing its status.
   * @param actor - Signed-in owner.
   * @param planId - Lesson plan id.
   * @param input - Replacement fields. Owner fields are ignored.
   * @returns The saved plan, still in its previous status.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When the actor cannot edit this plan.
   * @throws {ValidationError} When a present field does not fit, or a sent-back plan is incomplete.
   */
  async save(actor: Actor, planId: string, input: PlanBody): Promise<LessonPlanRecord> {
    // 1. Load the plan and reject a missing or soft-deleted row.
    const plan = await this.load(planId);

    // 2. Only the owner may edit, and only while the plan is a draft or sent back.
    const status = planStatus(plan.status);
    if (!sameId(plan.authorId, actor.id) || (status !== 'DRAFT' && status !== 'CHANGES_REQUESTED')) {
      throw new ForbiddenError('You cannot edit this plan.');
    }

    // 3. Validate the body before writing so a bad field is not stored.
    if (status === 'DRAFT') {
      const draft = readDraftPlan(input);
      const updated = await this.writeDraft(plan._id, draft);
      return toLessonPlanRecord(updated);
    }

    const complete = readCompletePlan(input);
    const updated = await this.writeComplete(plan._id, complete);
    return toLessonPlanRecord(updated);
  }

  /**
   * Submits the owner's draft or sent-back plan and stores one review note.
   * @param actor - Signed-in owner.
   * @param planId - Lesson plan id.
   * @returns The plan now in review.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When the actor does not own the plan.
   * @throws {ConflictError} When the current status cannot be submitted.
   * @throws {ValidationError} When the stored plan is incomplete.
   * @example
   * await plans.submit(teacher, planId);
   */
  async submit(actor: Actor, planId: string): Promise<LessonPlanRecord> {
    // 1. Load the plan and reject a missing or soft-deleted row.
    const plan = await this.load(planId);

    // 2. Only the owner may submit, and only from draft or sent back. An illegal jump writes no note.
    if (!sameId(plan.authorId, actor.id)) {
      throw new ForbiddenError('You cannot submit this plan.');
    }
    const status = planStatus(plan.status);
    if (status !== 'DRAFT' && status !== 'CHANGES_REQUESTED') {
      throw new ConflictError(illegalStatusMessage);
    }

    // 3. Require a complete plan before the status changes.
    readCompletePlan(storedPlanInput(plan));

    // 4. Mark it submitted and store one note, putting the old status back if the note insert fails.
    const updated = await this.commitStatus(plan, 'SUBMITTED', actor.id);
    return updated;
  }

  /**
   * Soft-deletes a plan. A teacher may remove only their own plan, and never an approved one.
   * @param actor - Signed-in teacher or head of department.
   * @param planId - Lesson plan id.
   * @returns The plan with `deletedAt` set.
   * @throws {NotFoundError} When the plan is missing or already soft-deleted.
   * @throws {ForbiddenError} When the actor cannot remove this plan.
   */
  async remove(actor: Actor, planId: string): Promise<LessonPlanRecord> {
    // 1. Load the plan and reject a missing or soft-deleted row.
    const plan = await this.load(planId);

    // 2. A teacher may remove only their own unapproved plan. An HOD may remove any.
    const owner = sameId(plan.authorId, actor.id);
    if (actor.role !== 'HOD' && (!owner || planStatus(plan.status) === 'APPROVED')) {
      throw new ForbiddenError('You cannot remove this plan.');
    }

    // 3. Soft-delete the plan. There is no restore.
    try {
      const updated = await this.plans
        .findOneAndUpdate(
          { _id: plan._id, deletedAt: null },
          { $set: { deletedAt: new Date() } },
          { returnDocument: 'after' },
        )
        .lean();
      if (!updated) {
        throw new NotFoundError(missingPlanMessage);
      }
      return toLessonPlanRecord(updated);
    } catch (error) {
      rethrowDomain(error);
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
   * Inserts a draft. Mongoose applies the empty resources default when resources were omitted.
   * @param actor - Signed-in author.
   * @param draft - Valid present fields.
   * @returns The inserted document.
   * @throws {ValidationError} When the database rejects a field.
   * @throws {NotFoundError} When the author id cannot be stored.
   */
  private async insertDraft(actor: Actor, draft: DraftPlan) {
    try {
      return await this.plans.create({
        ...definedDraft(draft),
        authorId: actor.id,
        status: 'DRAFT' satisfies PlanStatus,
      });
    } catch (error) {
      rethrowDomain(error);
    }
  }

  /**
   * Replaces a draft with the provided fields and unsets the omitted ones.
   * @param id - Stored plan id.
   * @param draft - Valid draft fields.
   * @returns The updated plan.
   * @throws {NotFoundError} When the draft row is no longer active.
   */
  private async writeDraft(id: unknown, draft: DraftPlan) {
    const update = draftUpdate(draft);
    try {
      const updated = await this.plans
        .findOneAndUpdate(
          { _id: id, deletedAt: null, status: 'DRAFT' },
          update,
          { returnDocument: 'after', runValidators: true },
        )
        .lean();
      if (!updated) {
        throw new NotFoundError(missingPlanMessage);
      }
      return updated;
    } catch (error) {
      rethrowDomain(error);
    }
  }

  /**
   * Replaces a sent-back plan with a complete body and leaves the status alone.
   * @param id - Stored plan id.
   * @param complete - Valid complete fields.
   * @returns The updated plan.
   * @throws {NotFoundError} When the sent-back row is no longer active.
   */
  private async writeComplete(id: unknown, complete: CompletePlan) {
    try {
      const updated = await this.plans
        .findOneAndUpdate(
          { _id: id, deletedAt: null, status: 'CHANGES_REQUESTED' },
          { $set: complete },
          { returnDocument: 'after', runValidators: true },
        )
        .lean();
      if (!updated) {
        throw new NotFoundError(missingPlanMessage);
      }
      return updated;
    } catch (error) {
      rethrowDomain(error);
    }
  }

  /**
   * Sets SUBMITTED and inserts the system note, then restores the old status if the note insert throws.
   * @param plan - Active plan already checked for ownership and status.
   * @param next - Status stored for this submit.
   * @param authorId - Signed-in owner id.
   * @returns The submitted plan.
   * @throws {ConflictError} When the status changed before the write.
   */
  private async commitStatus(
    plan: { _id: unknown; status?: unknown },
    next: 'SUBMITTED',
    authorId: string,
  ): Promise<LessonPlanRecord> {
    const previous = planStatus(plan.status);
    // 1. Set SUBMITTED only while the previous status is still current.
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

    // 2. Store one submitted note, and put the previous status back if that insert throws.
    try {
      await this.notes.create({
        planId: String(plan._id),
        authorId,
        kind: 'SUBMITTED',
        body: 'Submitted for review.',
      });
    } catch (error) {
      await this.plans.updateOne({ _id: plan._id, deletedAt: null }, { $set: { status: previous } });
      throw error;
    }

    return toLessonPlanRecord(updated);
  }
}

/**
 * Builds the list filter. `q` is an escaped case-insensitive substring of title or topic.
 * @param actor - Signed-in caller.
 * @param query - Search and exact filters.
 * @returns A filter that always excludes soft-deleted plans.
 */
function listFilter(actor: Actor, query: PlanListQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (actor.role === 'TEACHER') {
    filter.authorId = actor.id;
  }

  const q = typeof query.q === 'string' ? query.q : '';
  if (q !== '') {
    const pattern = escapeRegex(q);
    filter.$or = [{ title: { $regex: pattern, $options: 'i' } }, { topic: { $regex: pattern, $options: 'i' } }];
  }

  if (isPlanStatus(query.status)) {
    filter.status = query.status;
  }
  if (isSubject(query.subject)) {
    filter.subject = query.subject;
  }
  const grade = gradeFilter(query.grade);
  if (grade !== undefined) {
    filter.grade = grade;
  }
  return filter;
}

/**
 * Keeps a grade filter only when it is an integer from 6 to 12.
 * @param value - Raw grade query value.
 * @returns The grade, or undefined when the query should not filter by grade.
 */
function gradeFilter(value: number | string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const grade = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(grade) || grade < 6 || grade > 12) {
    return undefined;
  }
  return grade;
}

/**
 * Escapes regex metacharacters so `q` is a literal substring.
 * @param value - Raw search text.
 * @returns The same text safe to place in a MongoDB regex.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Copies the draft fields the client actually sent.
 * @param draft - Parsed draft.
 * @returns Fields to insert. Omitted fields stay absent.
 */
function definedDraft(draft: DraftPlan): Record<string, string | number> {
  const fields: Record<string, string | number> = {};
  for (const field of DRAFT_FIELDS) {
    const value = draft[field];
    if (value !== undefined) {
      fields[field] = value;
    }
  }
  return fields;
}

/**
 * Builds a draft update that unsets omitted optional fields and does not change status.
 * @param draft - Parsed draft.
 * @returns The MongoDB update.
 */
function draftUpdate(draft: DraftPlan): { $set?: Record<string, string | number>; $unset?: Record<string, 1> } {
  const $set: Record<string, string | number> = {};
  const $unset: Record<string, 1> = {};
  for (const field of DRAFT_FIELDS) {
    const value = draft[field];
    if (value === undefined) {
      $unset[field] = 1;
    } else {
      $set[field] = value;
    }
  }

  const update: { $set?: Record<string, string | number>; $unset?: Record<string, 1> } = {};
  if (Object.keys($set).length > 0) {
    update.$set = $set;
  }
  if (Object.keys($unset).length > 0) {
    update.$unset = $unset;
  }
  return update;
}

/**
 * Reads the stored plan as a complete-plan payload. Missing resources count as `''`.
 * @param plan - Stored plan fields.
 * @returns A plain object for the complete schema.
 */
function storedPlanInput(plan: {
  title?: unknown;
  subject?: unknown;
  grade?: unknown;
  durationMinutes?: unknown;
  topic?: unknown;
  objectives?: unknown;
  activities?: unknown;
  resources?: unknown;
}): Record<string, unknown> {
  return {
    title: plan.title,
    subject: plan.subject,
    grade: plan.grade,
    durationMinutes: plan.durationMinutes,
    topic: plan.topic,
    objectives: plan.objectives,
    activities: plan.activities,
    resources: typeof plan.resources === 'string' ? plan.resources : '',
  };
}
