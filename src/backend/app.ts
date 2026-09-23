import { AuthManager } from '@/backend/managers/auth.manager';
import { PlanManager } from '@/backend/managers/plan.manager';
import { ReviewManager } from '@/backend/managers/review.manager';
import { lessonPlanModel } from '@/backend/models/lesson-plan.model';
import { reviewNoteModel } from '@/backend/models/review-note.model';
import { userModel } from '@/backend/models/user.model';
import { connectMongo } from '@/backend/server';

let authManager: AuthManager | undefined;
let planManager: PlanManager | undefined;
let reviewManager: ReviewManager | undefined;

/**
 * Returns the shared auth manager, constructing it with the user model on first use.
 * @returns The process-wide `AuthManager`.
 */
export function getAuthManager(): AuthManager {
  authManager ??= new AuthManager(userModel());
  return authManager;
}

/**
 * Returns the shared plan manager after Mongo is connected.
 * @returns The process-wide `PlanManager`.
 */
export async function getPlanManager(): Promise<PlanManager> {
  await connectMongo();
  planManager ??= new PlanManager(lessonPlanModel(), reviewNoteModel());
  return planManager;
}

/**
 * Returns the shared review manager after Mongo is connected.
 * @returns The process-wide `ReviewManager`.
 */
export async function getReviewManager(): Promise<ReviewManager> {
  await connectMongo();
  reviewManager ??= new ReviewManager(lessonPlanModel(), reviewNoteModel());
  return reviewManager;
}
