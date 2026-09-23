'use client';

import { Suspense, useEffect, useState } from 'react';
import type { LessonPlanRecord } from '@/backend/models/types';
import { RegisterView } from '@/frontend/components/plans/RegisterView';
import { RegisterSkeleton } from '@/frontend/components/plans/Skeleton';
import { emptyQueue, filterNone, navQueue, queueForbidden } from '@/frontend/copy';
import { useSession } from '@/frontend/contexts/SessionContext';
import { hasNarrowingFilters, usePlanFilters } from '@/frontend/hooks/usePlanFilters';
import { listPlans } from '@/frontend/services/plans';

const QUEUE_STATUS = 'SUBMITTED';

/**
 * Review queue. Teachers see the forbidden sentence and no rows.
 * The skeleton stays only until the session has settled.
 * @returns The queue page.
 */
export function HodQueuePage() {
  return (
    <Suspense fallback={<QueueFallback />}>
      <HodQueue />
    </Suspense>
  );
}

/**
 * Lists submitted plans for a head of department. A missing status filter means submitted.
 * @returns The queue, a skeleton while the session is loading, or the forbidden sentence.
 */
function HodQueue() {
  const { actor, ready } = useSession();
  const { filters, setFilter } = usePlanFilters({ defaultStatus: QUEUE_STATUS });
  const [plans, setPlans] = useState<LessonPlanRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { status, subject, grade, q, sort } = filters;
  const queryKey =
    actor?.role === 'HOD'
      ? `${status}\u0000${subject}\u0000${grade}\u0000${q}\u0000${sort}\u0000${attempt}`
      : 'idle';
  const [seenKey, setSeenKey] = useState(queryKey);

  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setPlans(null);
    setLoadError(false);
  }

  useEffect(() => {
    if (actor?.role !== 'HOD') {
      return;
    }

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
  }, [actor, status, subject, grade, q, sort, attempt]);

  if (!ready) {
    return <QueueFallback />;
  }

  if (actor?.role !== 'HOD') {
    return (
      <main className="register-page">
        <p>{queueForbidden}</p>
      </main>
    );
  }

  return (
    <RegisterView
      empty={hasNarrowingFilters(filters, QUEUE_STATUS) ? filterNone : emptyQueue}
      error={loadError}
      filters={filters}
      heading={navQueue}
      loading={plans === null}
      plans={plans ?? []}
      onChange={setFilter}
      onRetry={() => setAttempt((current) => current + 1)}
    />
  );
}

/**
 * Ruled bars shown while the queue is loading.
 * @returns A register skeleton.
 */
function QueueFallback() {
  return (
    <main aria-busy="true" className="register-page">
      <RegisterSkeleton />
    </main>
  );
}
