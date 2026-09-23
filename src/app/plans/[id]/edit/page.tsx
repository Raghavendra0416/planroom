import type { Metadata } from 'next';
import { navPlans } from '@/frontend/copy';
import { PlanFormPage } from '@/frontend/pages/PlanFormPage';

export const metadata: Metadata = {
  title: navPlans,
};

/**
 * Renders the edit form for one plan.
 * @param props - Page props.
 * @param props.params - Route params. `id` is the lesson plan id.
 * @returns The edit page.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanFormPage planId={id} />;
}
