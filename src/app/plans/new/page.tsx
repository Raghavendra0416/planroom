import type { Metadata } from 'next';
import { newPlan } from '@/frontend/copy';
import { PlanFormPage } from '@/frontend/pages/PlanFormPage';

export const metadata: Metadata = {
  title: newPlan,
};

/**
 * Renders the new-plan form.
 * @returns The create page.
 */
export default function Page() {
  return <PlanFormPage />;
}
