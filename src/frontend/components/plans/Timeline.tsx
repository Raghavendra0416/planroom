import type { ReviewNoteRecord } from '@/backend/models/types';

/**
 * Notes for one plan, oldest first, separated by rules.
 * @param props - Timeline props.
 * @param props.notes - Notes already ordered oldest first.
 * @returns The note list, or nothing when the plan has no notes.
 */
export function Timeline({ notes }: { notes: readonly ReviewNoteRecord[] }) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <ol className="timeline">
      {notes.map((note) => (
        <li className="timeline-item" key={note.id}>
          <p>{note.body}</p>
          <p className="timeline-time">{formatNoteTime(note.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Formats a note timestamp without adding a product sentence.
 * @param iso - ISO 8601 `createdAt`.
 * @returns A short date and time, or `''` when the value is not a date.
 */
function formatNoteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
