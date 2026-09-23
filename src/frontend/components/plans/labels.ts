import { SUBJECTS, type PlanStatus, type Subject } from '@/backend/models/types';
import {
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
} from '@/frontend/copy';

const STATUS_LABELS: Record<PlanStatus, string> = {
  DRAFT: statusDraft,
  SUBMITTED: statusSubmitted,
  CHANGES_REQUESTED: statusChanges,
  APPROVED: statusApproved,
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
