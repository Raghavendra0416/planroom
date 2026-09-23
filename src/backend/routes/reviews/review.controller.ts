import { getReviewManager } from '@/backend/app';
import type { ReviewManager } from '@/backend/managers/review.manager';
import type { Actor, LessonPlanRecord, ReviewNoteRecord } from '@/backend/models/types';
import { ValidationError } from '@/backend/utils/errors';

/**
 * Success payload for a review route. Failures are thrown and mapped by the route.
 */
export interface ReviewSuccess<T> {
  status: number;
  body: { ok: true; data: T };
}

type ReviewAction = 'request_changes' | 'approve' | 'reopen' | 'comment';

/**
 * Review HTTP action: send back, approve, reopen, or comment.
 */
export class ReviewController {
  /**
   * @param reviews - Manager that owns review rules.
   */
  constructor(private readonly reviews: ReviewManager) {}

  /**
   * Applies one review action from the JSON body.
   * @param actor - Signed-in caller. The manager checks the head-of-department rule.
   * @param planId - Lesson plan id from the route.
   * @param body - `{ action, note? }`. The note is passed through when the action needs one.
   * @returns The updated plan, or the stored comment.
   * @throws {ValidationError} When `action` is missing or not a review action.
   * @throws {NotFoundError} When the plan is missing or soft-deleted.
   * @throws {ForbiddenError} When the actor cannot review this plan.
   * @throws {ConflictError} When the status change is not legal.
   */
  async review(
    actor: Actor,
    planId: string,
    body: unknown,
  ): Promise<ReviewSuccess<LessonPlanRecord | ReviewNoteRecord>> {
    // 1. Read the action and the optional note. An unknown action is a field error.
    const request = readReview(body);

    // 2. Call the matching review method. Approve ignores the note.
    if (request.action === 'request_changes') {
      return ok(await this.reviews.requestChanges(actor, planId, request.note));
    }
    if (request.action === 'approve') {
      return ok(await this.reviews.approve(actor, planId));
    }
    if (request.action === 'reopen') {
      return ok(await this.reviews.reopen(actor, planId, request.note));
    }
    return ok(await this.reviews.comment(actor, planId, request.note));
  }
}

/**
 * Builds a controller around the shared review manager.
 * @returns A review controller that does not import Next or React.
 */
export async function createReviewController(): Promise<ReviewController> {
  return new ReviewController(await getReviewManager());
}

/**
 * Wraps a manager result in the success envelope.
 * @param data - JSON payload for `data`.
 * @returns Status 200 and `{ ok: true, data }`.
 */
function ok<T>(data: T): ReviewSuccess<T> {
  return { status: 200, body: { ok: true, data } };
}

/**
 * Reads a review action and note from untrusted JSON.
 * @param body - Parsed request body.
 * @returns The action and the note string, or `''` when the note was omitted.
 * @throws {ValidationError} When `action` is not one of the four review actions.
 */
function readReview(body: unknown): { action: ReviewAction; note: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError({ action: 'Invalid' });
  }

  const record = body as Record<string, unknown>;
  const action = record.action;
  if (action !== 'request_changes' && action !== 'approve' && action !== 'reopen' && action !== 'comment') {
    throw new ValidationError({ action: 'Invalid' });
  }

  return {
    action,
    note: typeof record.note === 'string' ? record.note : '',
  };
}
