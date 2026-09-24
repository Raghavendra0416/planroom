'use client';

import { useEffect, useState } from 'react';
import type { LessonPlanRecord } from '@/backend/models/types';
import { summarizePlans, type PlanSummary } from '@/frontend/components/dashboard/summarizePlans';
import { listPlans } from '@/frontend/services/plans';

/**
 * Dashboard state for one signed-in actor. The list is already role-scoped server side.
 */
export interface DashboardMetricsState {
  summary: PlanSummary | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

/**
 * Loads every visible plan once and reduces it to dashboard totals.
 * @returns The summary, loading and error flags, and a retry function.
 */
export function useDashboardMetrics(): DashboardMetricsState {
  const [plans, setPlans] = useState<LessonPlanRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void listPlans({ status: '', subject: '', grade: '', q: '', sort: 'updatedAt' }).then((result) => {
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
  }, [attempt]);

  return {
    summary: plans === null ? null : summarizePlans(plans),
    loading: plans === null,
    error: loadError,
    retry: () => {
      setPlans(null);
      setLoadError(false);
      setAttempt((current) => current + 1);
    },
  };
}
