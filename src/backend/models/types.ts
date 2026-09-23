/**
 * Account role stored on a user and copied onto the signed-in actor.
 */
export type Role = 'TEACHER' | 'HOD';

/**
 * Subjects a lesson plan may use, in the order shown to teachers.
 */
export const SUBJECTS = [
  'ENGLISH',
  'MATHS',
  'SCIENCE',
  'SOCIAL_SCIENCE',
  'COMPUTER',
  'ARTS',
  'OTHER',
] as const;

/**
 * School subject stored on a lesson plan.
 */
export type Subject = (typeof SUBJECTS)[number];

/**
 * Review state of a lesson plan.
 */
export type PlanStatus = 'DRAFT' | 'SUBMITTED' | 'CHANGES_REQUESTED' | 'APPROVED';

/**
 * Why a review note was written.
 */
export type NoteKind = 'COMMENT' | 'SUBMITTED' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REOPENED';

/**
 * Signed-in caller. `id` is the user's 24-hex id.
 */
export interface Actor {
  id: string;
  role: Role;
  email: string;
  name: string;
}

/**
 * Fields a caller may send when saving a lesson plan. Omitted optionals stay unset.
 */
export interface PlanInput {
  title?: string;
  subject?: Subject;
  grade?: number;
  durationMinutes?: number;
  topic?: string;
  objectives?: string;
  activities?: string;
  resources?: string;
}

/**
 * Lesson plan JSON. Ids are 24 hex characters, dates are ISO 8601, and `resources` is always a string.
 */
export interface LessonPlanRecord {
  id: string;
  title?: string;
  subject?: Subject;
  grade?: number;
  durationMinutes?: number;
  topic?: string;
  objectives?: string;
  activities?: string;
  resources: string;
  status: PlanStatus;
  authorId: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Review note JSON. Ids are 24 hex characters and `createdAt` is ISO 8601.
 */
export interface ReviewNoteRecord {
  id: string;
  planId: string;
  authorId: string;
  body: string;
  kind: NoteKind;
  createdAt: string;
}

/**
 * User JSON. Dates are ISO 8601. The password hash is not included.
 */
export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}
