'use client';

import { DashboardMetrics } from '@/frontend/components/dashboard/DashboardMetrics';
import { RegisterSkeleton } from '@/frontend/components/plans/Skeleton';
import { useSession } from '@/frontend/contexts/SessionContext';

/**
 * Signed-in home dashboard. Signed-out visitors never arrive here; the proxy sends them to login.
 * @returns The home dashboard, or a skeleton while the session settles.
 */
export function HomePage() {
  const { actor, ready } = useSession();

  if (!ready || !actor) {
    return (
      <div aria-busy="true" className="home">
        <RegisterSkeleton />
      </div>
    );
  }

  return <DashboardMetrics actor={actor} />;
}
