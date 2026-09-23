import type { Metadata } from 'next';
import { navPlans } from '@/frontend/copy';
import { PlanListPage } from '@/frontend/pages/PlanListPage';

export const metadata: Metadata = {
  title: navPlans,
};

/**
 * Renders the plan register.
 * @returns The plans page.
 */
export default function Page() {
  return <PlanListPage />;
}
