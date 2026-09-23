import type { LessonPlanRecord } from '@/backend/models/types';
import { PlanFilterBar } from '@/frontend/components/plans/PlanFilterBar';
import { RegisterRow } from '@/frontend/components/plans/RegisterRow';
import { RegisterSkeleton } from '@/frontend/components/plans/Skeleton';
import { Button } from '@/frontend/components/ui/button';
import { genericError, retry } from '@/frontend/copy';
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
    <main aria-busy={loading || undefined} className="register-page">
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
        <div className="register">
          {plans.map((plan) => (
            <RegisterRow key={plan.id} plan={plan} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
