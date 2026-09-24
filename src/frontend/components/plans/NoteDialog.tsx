'use client';

import { Dialog, useDialogTitleId } from '@/frontend/components/ui/dialog';
import { Button } from '@/frontend/components/ui/button';
import { FieldError } from '@/frontend/components/plans/FieldError';
import { cancel } from '@/frontend/copy';

/**
 * Note sheet for send back, reopen, and comment. Escape closes it and does not save.
 * @param props - Dialog props.
 * @param props.label - Action name used as the title and the confirm button.
 * @param props.note - Current note text.
 * @param props.error - Empty-note sentence or the API note field message.
 * @param props.pending - Disables confirm while the write is in flight.
 * @param props.danger - Uses the oxide confirm treatment for send back and reopen.
 * @param props.onNoteChange - Updates the note. It does not close the sheet.
 * @param props.onConfirm - Checks the note and writes it. An empty note must leave the sheet open.
 * @param props.onOpenChange - Called when Escape or the scrim asks to close. Closing changes nothing.
 * @returns The open note sheet.
 */
export function NoteDialog({
  label,
  note,
  error,
  pending,
  danger = false,
  onNoteChange,
  onConfirm,
  onOpenChange,
}: {
  label: string;
  note: string;
  error: string;
  pending: boolean;
  danger?: boolean;
  onNoteChange: (note: string) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const titleId = useDialogTitleId();

  return (
    <Dialog open title={label} titleId={titleId} onOpenChange={onOpenChange}>
      <label className="sr-only" htmlFor="review-note">
        {label}
      </label>
      <textarea
        aria-describedby={error ? 'review-note-error' : undefined}
        aria-invalid={error ? true : undefined}
        className={error ? 'has-error' : undefined}
        id="review-note"
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
      />
      <FieldError id="review-note-error" message={error} />
      <div className="sheet-actions">
        <Button disabled={pending} type="button" variant="quiet" onClick={() => onOpenChange(false)}>
          {cancel}
        </Button>
        <Button disabled={pending} type="button" variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {label}
        </Button>
      </div>
    </Dialog>
  );
}
