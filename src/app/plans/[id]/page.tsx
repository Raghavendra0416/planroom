import type { Metadata } from 'next';
import { navPlans } from '@/frontend/copy';
import { PlanDetailPage } from '@/frontend/pages/PlanDetailPage';

export const metadata: Metadata = {
  title: navPlans,
};

/**
 * Renders one plan.
 * @param props - Page props.
 * @param props.params - Route params. `id` is the lesson plan id.
 * @returns The detail page.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanDetailPage planId={id} />;
}
