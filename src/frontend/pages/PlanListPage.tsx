'use client';

import { Suspense, useEffect, useState } from 'react';
import { RegisterView } from '@/frontend/components/plans/RegisterView';
import { RegisterSkeleton } from '@/frontend/components/plans/Skeleton';
import { emptyList, filterNone, navPlans } from '@/frontend/copy';
import { hasNarrowingFilters, usePlanFilters } from '@/frontend/hooks/usePlanFilters';
import type { LessonPlanRecord } from '@/backend/models/types';
import { listPlans } from '@/frontend/services/plans';

/**
 * Plan register. A skeleton, then the rows, or an empty sentence.
 * @returns The plans page.
 */
export function PlanListPage() {
  return (
    <Suspense fallback={<RegisterFallback />}>
      <PlanList />
    </Suspense>
  );
}

/**
 * Loads the signed-in actor's visible plans from the query string.
 * @returns The register, including filters.
 */
function PlanList() {
  const { filters, setFilter } = usePlanFilters();
  const [plans, setPlans] = useState<LessonPlanRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { status, subject, grade, q, sort } = filters;
  const queryKey = `${status}\u0000${subject}\u0000${grade}\u0000${q}\u0000${sort}\u0000${attempt}`;
  const [seenKey, setSeenKey] = useState(queryKey);

  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setPlans(null);
    setLoadError(false);
  }

  useEffect(() => {
    let cancelled = false;

    void listPlans({ status, subject, grade, q, sort }).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setLoadError(true);
        setPlans([]);
        return;
      }
      setLoadError(false);
      setPlans(result.data);
    });

    return () => {
      cancelled = true;
    };
  }, [status, subject, grade, q, sort, attempt]);

  return (
    <RegisterView
      empty={hasNarrowingFilters(filters) ? filterNone : emptyList}
      error={loadError}
      filters={filters}
      heading={navPlans}
      loading={plans === null}
      plans={plans ?? []}
      onChange={setFilter}
      onRetry={() => setAttempt((current) => current + 1)}
    />
  );
}

/**
 * Ruled bars shown until the query string can be read.
 * @returns A register skeleton.
 */
function RegisterFallback() {
  return (
    <main aria-busy="true" className="register-page">
      <RegisterSkeleton />
    </main>
  );
}
