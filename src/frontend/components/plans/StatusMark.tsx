import type { PlanStatus } from '@/backend/models/types';
import { statusLabel } from '@/frontend/components/plans/labels';

/**
 * Eight-pixel status stamp with the status word in ink.
 * @param props - Status props.
 * @param props.status - Stored plan status. The word comes from the copy table.
 * @returns The stamp and the status word.
 */
export function StatusMark({ status }: { status: PlanStatus }) {
  return (
    <span className="status-mark">
      <span aria-hidden="true" className={`status-stamp status-stamp-${status}`} />
      <span>{statusLabel(status)}</span>
    </span>
  );
}
