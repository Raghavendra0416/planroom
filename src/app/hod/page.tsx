import type { Metadata } from 'next';
import { navQueue } from '@/frontend/copy';
import { HodQueuePage } from '@/frontend/pages/HodQueuePage';

export const metadata: Metadata = {
  title: navQueue,
};

/**
 * Renders the review queue.
 * @returns The queue page.
 */
export default function Page() {
  return <HodQueuePage />;
}
