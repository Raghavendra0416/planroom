import { getPlanManager, getReviewManager } from '@/backend/app';
import type { PlanListQuery, PlanManager } from '@/backend/managers/plan.manager';
import type { ReviewManager } from '@/backend/managers/review.manager';
import type { Actor, LessonPlanRecord, ReviewNoteRecord } from '@/backend/models/types';
import type { CreatePlanBody, PlanBody } from '@/backend/validation/plan';

/**
 * Success payload for a plan route. Failures are thrown and mapped by the route.
 */
export interface PlanSuccess<T> {
  status: number;
  body: { ok: true; data: T };
}

/**
 * Plan HTTP actions: list, read, create, save, submit, and remove.
 */
export class PlanController {
  /**
   * @param plans - Manager that owns plan rules.
   * @param reviews - Manager that lists notes for one plan.
   */
  constructor(
    private readonly plans: PlanManager,
    private readonly reviews: ReviewManager,
  ) {}

  /**
   * Lists plans visible to the actor.
   * @param actor - Signed-in teacher or head of department.
   * @param query - Search, sort, and exact filters. Unknown values are left for the manager.
   * @returns The matching plans.
   */
  async list(actor: Actor, query: PlanListQuery): Promise<PlanSuccess<{ plans: LessonPlanRecord[] }>> {
    const plans = await this.plans.list(actor, query);
    return ok({ plans });
  }

  /**
   * Opens one plan and its notes.
   * @param actor - Signed-in teacher or head of department.
   * @param planId - Lesson plan id from the route.
   * @returns The plan and its notes, oldest first.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When a teacher opens someone else's plan.
   */
  async get(actor: Actor, planId: string): Promise<PlanSuccess<{ plan: LessonPlanRecord; notes: ReviewNoteRecord[] }>> {
    // 1. Open the plan. A missing or forbidden plan throws before notes are read.
    const plan = await this.plans.get(actor, planId);

    // 2. Attach that plan's notes, oldest first.
    const notes = await this.reviews.listNotes(actor, planId);
    return ok({ plan, notes });
  }

  /**
   * Creates a plan from the JSON body. `intent` is passed through.
   * @param actor - Signed-in author.
   * @param body - Untrusted JSON body.
   * @returns The created plan.
   * @throws {ValidationError} When a present field does not fit, or a submit is incomplete.
   */
  async create(actor: Actor, body: unknown): Promise<PlanSuccess<LessonPlanRecord>> {
    const plan = await this.plans.create(actor, body as CreatePlanBody);
    return ok(plan);
  }

  /**
   * Saves a plan from the JSON body without changing status.
   * @param actor - Signed-in owner.
   * @param planId - Lesson plan id from the route.
   * @param body - Untrusted JSON body.
   * @returns The saved plan.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When the actor cannot edit this plan.
   * @throws {ValidationError} When a present field does not fit, or a sent-back plan is incomplete.
   */
  async save(actor: Actor, planId: string, body: unknown): Promise<PlanSuccess<LessonPlanRecord>> {
    const plan = await this.plans.save(actor, planId, body as PlanBody);
    return ok(plan);
  }

  /**
   * Submits the owner's draft or sent-back plan.
   * @param actor - Signed-in owner.
   * @param planId - Lesson plan id from the route.
   * @returns The plan now in review.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When the actor does not own the plan.
   * @throws {ConflictError} When the current status cannot be submitted.
   * @throws {ValidationError} When the stored plan is incomplete.
   */
  async submit(actor: Actor, planId: string): Promise<PlanSuccess<LessonPlanRecord>> {
    const plan = await this.plans.submit(actor, planId);
    return ok(plan);
  }

  /**
   * Soft-deletes a plan.
   * @param actor - Signed-in teacher or head of department.
   * @param planId - Lesson plan id from the route.
   * @returns The plan with `deletedAt` set.
   * @throws {NotFoundError} When the plan is missing or already soft-deleted.
   * @throws {ForbiddenError} When the actor cannot remove this plan.
   */
  async remove(actor: Actor, planId: string): Promise<PlanSuccess<LessonPlanRecord>> {
    const plan = await this.plans.remove(actor, planId);
    return ok(plan);
  }
}

/**
 * Builds a controller around the shared plan and review managers.
 * @returns A plan controller that does not import Next or React.
 */
export async function createPlanController(): Promise<PlanController> {
  return new PlanController(await getPlanManager(), await getReviewManager());
}

/**
 * Wraps a manager result in the success envelope.
 * @param data - JSON payload for `data`.
 * @returns Status 200 and `{ ok: true, data }`.
 */
function ok<T>(data: T): PlanSuccess<T> {
  return { status: 200, body: { ok: true, data } };
}
