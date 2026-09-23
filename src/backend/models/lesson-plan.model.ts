import mongoose from 'mongoose';
import { SUBJECTS, type PlanStatus, type Subject } from '@/backend/models/types';

/**
 * Drops an empty string so optional plan text is omitted instead of stored.
 * @param value - Text assigned to the path.
 * @returns The text, or undefined when the value is `''`.
 */
function omitEmptyString(value: unknown): unknown {
  return value === '' ? undefined : value;
}

const lessonPlanSchema = new mongoose.Schema(
  {
    title: { type: String, set: omitEmptyString },
    subject: {
      type: String,
      enum: SUBJECTS satisfies readonly Subject[],
    },
    grade: { type: Number, min: 6, max: 12 },
    durationMinutes: { type: Number },
    topic: { type: String, set: omitEmptyString },
    objectives: { type: String, set: omitEmptyString },
    activities: { type: String, set: omitEmptyString },
    resources: { type: String, default: '' },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED'] satisfies readonly PlanStatus[],
      default: 'DRAFT' satisfies PlanStatus,
    },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'lesson_plans', timestamps: true },
);

lessonPlanSchema.index({ authorId: 1, status: 1 });
lessonPlanSchema.index({ status: 1, updatedAt: -1 });
lessonPlanSchema.index({ deletedAt: 1, status: 1 });
lessonPlanSchema.index({ title: 'text', topic: 'text' });

function compileLessonPlanModel() {
  return mongoose.model('LessonPlan', lessonPlanSchema);
}

/**
 * Returns the compiled LessonPlan model on the active Mongoose connection.
 * @returns The `lesson_plans` collection model.
 */
export function lessonPlanModel(): ReturnType<typeof compileLessonPlanModel> {
  const existing = mongoose.models.LessonPlan as ReturnType<typeof compileLessonPlanModel> | undefined;
  return existing ?? compileLessonPlanModel();
}
