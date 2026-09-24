import { SUBJECTS, type NoteKind, type PlanStatus, type Role, type Subject } from '@/backend/models/types';
import {
  approveNote,
  commentNote,
  fieldActivities,
  fieldDuration,
  fieldGrade,
  fieldObjectives,
  fieldResources,
  fieldSubject,
  fieldTitle,
  fieldTopic,
  reopenNote,
  roleHod,
  roleTeacher,
  statusApproved,
  statusChanges,
  statusDraft,
  statusSubmitted,
  subjectArts,
  subjectComputer,
  subjectEnglish,
  subjectMaths,
  subjectOther,
  subjectScience,
  subjectSocial,
  submitNote,
} from '@/frontend/copy';

const STATUS_LABELS: Record<PlanStatus, string> = {
  DRAFT: statusDraft,
  SUBMITTED: statusSubmitted,
  CHANGES_REQUESTED: statusChanges,
  APPROVED: statusApproved,
};

const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  COMMENT: commentNote,
  SUBMITTED: submitNote,
  CHANGES_REQUESTED: statusChanges,
  APPROVED: approveNote,
  REOPENED: reopenNote,
};

const ROLE_LABELS: Record<Role, string> = {
  TEACHER: roleTeacher,
  HOD: roleHod,
};

const SUBJECT_LABELS: Record<Subject, string> = {
  ENGLISH: subjectEnglish,
  MATHS: subjectMaths,
  SCIENCE: subjectScience,
  SOCIAL_SCIENCE: subjectSocial,
  COMPUTER: subjectComputer,
  ARTS: subjectArts,
  OTHER: subjectOther,
};

/**
 * Status word shown beside the stamp.
 * @param status - Stored plan status.
 * @returns Draft, In review, Sent back, or Approved.
 */
export function statusLabel(status: PlanStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Note badge word shown on a timeline entry.
 * @param kind - Why the review note was written.
 * @returns The badge label from the copy table.
 */
export function noteKindLabel(kind: NoteKind): string {
  return NOTE_KIND_LABELS[kind];
}

/**
 * Role word shown beside a note author.
 * @param role - Stored account role.
 * @returns Teacher or head of department.
 */
export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

/**
 * Subject word shown on a row, document, and select.
 * @param subject - Stored subject.
 * @returns The subject label from the copy table.
 */
export function subjectLabel(subject: Subject): string {
  return SUBJECT_LABELS[subject];
}

/**
 * Subject select options in stored order.
 * @returns Value and label pairs for every subject.
 */
export function subjectOptions(): { value: Subject; label: string }[] {
  return SUBJECTS.map((subject) => ({ value: subject, label: subjectLabel(subject) }));
}

const PLAN_FIELD_LABELS: Record<string, string> = {
  title: fieldTitle,
  subject: fieldSubject,
  grade: fieldGrade,
  durationMinutes: fieldDuration,
  topic: fieldTopic,
  objectives: fieldObjectives,
  activities: fieldActivities,
  resources: fieldResources,
};

const PLAN_FIELD_ORDER = [
  'title',
  'subject',
  'grade',
  'durationMinutes',
  'topic',
  'objectives',
  'activities',
  'resources',
];

/**
 * Visible labels for the plan fields that failed, in form order.
 * @param keys - Backend field keys from the API failure.
 * @returns Labels such as Title and Topic, skipping unknown keys.
 */
export function planFieldLabels(keys: readonly string[]): string[] {
  return PLAN_FIELD_ORDER.filter((key) => keys.includes(key)).map((key) => PLAN_FIELD_LABELS[key]);
}

/**
 * Builds the toast shown when a save fails. Names the failing fields so the
 * toast reads the same as the inline errors. Falls back to the generic sentence
 * when the failure has no field map, such as a network error.
 * @param fallback - Generic sentence for failures with no field map.
 * @param named - Field-aware sentence prefix, used when at least one known field failed.
 * @param resultFields - Field messages from the API failure.
 * @returns The toast message.
 */
export function planFailureToast(fallback: string, named: string, resultFields: Record<string, string>): string {
  const labels = planFieldLabels(Object.keys(resultFields));
  if (labels.length === 0) {
    return fallback;
  }
  return `${named} ${labels.join(', ')}.`;
}

/**
 * Status select options in review order.
 * @returns Value and label pairs for the four statuses.
 */
export function statusOptions(): { value: PlanStatus; label: string }[] {
  return (Object.keys(STATUS_LABELS) as PlanStatus[]).map((status) => ({
    value: status,
    label: statusLabel(status),
  }));
}
