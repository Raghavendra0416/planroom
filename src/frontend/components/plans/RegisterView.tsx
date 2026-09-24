import type { LessonPlanRecord } from '@/backend/models/types';
import { PlanFilterBar } from '@/frontend/components/plans/PlanFilterBar';
import { RegisterRow } from '@/frontend/components/plans/RegisterRow';
import { RegisterSkeleton } from '@/frontend/components/plans/Skeleton';
import { BackButton } from '@/frontend/components/ui/BackButton';
import { Button } from '@/frontend/components/ui/button';
import { backToHome, genericError, retry } from '@/frontend/copy';
import type { PlanFilterKey, PlanFilters } from '@/frontend/hooks/usePlanFilters';

/**
 * Register of plans with filters, a skeleton, an empty sentence, or the rows.
 * @param props - Register props.
 * @param props.heading - Page heading.
 * @param props.filters - Parsed filters.
 * @param props.onChange - Writes one filter key.
 * @param props.plans - Rows to show once loading has finished.
 * @param props.loading - When true, ruled bars replace the rows.
 * @param props.error - When true, shows the shared page-failure sentence and retry.
 * @param props.empty - Sentence for an empty list or queue.
 * @param props.onRetry - Loads the list again.
 * @returns The register page content.
 */
export function RegisterView({
  heading,
  filters,
  onChange,
  plans,
  loading,
  error,
  empty,
  onRetry,
}: {
  heading: string;
  filters: PlanFilters;
  onChange: (key: PlanFilterKey, value: string) => void;
  plans: readonly LessonPlanRecord[];
  loading: boolean;
  error: boolean;
  empty: string;
  onRetry: () => void;
}) {
  return (
    <div aria-busy={loading || undefined} className="register-page">
      <div className="page-top">
        <BackButton fallbackHref="/" label={backToHome} />
      </div>
      <h1>{heading}</h1>
      <PlanFilterBar filters={filters} onChange={onChange} />
      {loading ? <RegisterSkeleton /> : null}
      {!loading && error ? (
        <>
          <p>{genericError}</p>
          <Button type="button" onClick={onRetry}>
            {retry}
          </Button>
        </>
      ) : null}
      {!loading && !error && plans.length === 0 ? <p>{empty}</p> : null}
      {!loading && !error && plans.length > 0 ? (
        <ul className="register">
          {plans.map((plan) => (
            <li key={plan.id}>
              <RegisterRow plan={plan} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
