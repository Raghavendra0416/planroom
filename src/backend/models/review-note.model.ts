import mongoose from 'mongoose';
import type { NoteKind } from '@/backend/models/types';

const reviewNoteSchema = new mongoose.Schema(
  {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'LessonPlan', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 1000 },
    kind: {
      type: String,
      enum: ['COMMENT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REOPENED'] satisfies readonly NoteKind[],
    },
  },
  {
    collection: 'review_notes',
    timestamps: { createdAt: true, updatedAt: false },
  },
);

reviewNoteSchema.index({ planId: 1, createdAt: 1 });
reviewNoteSchema.index({ authorId: 1 });

function compileReviewNoteModel() {
  return mongoose.model('ReviewNote', reviewNoteSchema);
}

/**
 * Returns the compiled ReviewNote model on the active Mongoose connection.
 * @returns The `review_notes` collection model.
 */
export function reviewNoteModel(): ReturnType<typeof compileReviewNoteModel> {
  const existing = mongoose.models.ReviewNote as ReturnType<typeof compileReviewNoteModel> | undefined;
  return existing ?? compileReviewNoteModel();
}
