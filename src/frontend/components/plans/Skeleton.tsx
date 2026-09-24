import { loading } from '@/frontend/copy';

const ROW_KEYS = ['row-1', 'row-2', 'row-3', 'row-4'] as const;

/**
 * Ruled bars in the shape of register rows. They do not pulse.
 * @returns Four skeleton rows.
 */
export function RegisterSkeleton() {
  return (
    <div className="register-skeleton" role="status">
      <span className="sr-only">{loading}</span>
      <div aria-hidden="true">
        {ROW_KEYS.map((key) => (
          <div className="skeleton-row" key={key}>
            <span className="skeleton-bar skeleton-bar-title" />
            <span className="skeleton-bar" />
            <span className="skeleton-bar" />
            <span className="skeleton-bar skeleton-bar-short" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Ruled bars in the shape of a plan document. They do not pulse.
 * @returns A title bar and three text bars.
 */
export function DocumentSkeleton() {
  return (
    <div className="document-skeleton" role="status">
      <span className="sr-only">{loading}</span>
      <div aria-hidden="true" className="document-skeleton-bars">
        <span className="skeleton-bar skeleton-bar-title" />
        <span className="skeleton-bar" />
        <span className="skeleton-bar" />
        <span className="skeleton-bar skeleton-bar-short" />
      </div>
    </div>
  );
}
