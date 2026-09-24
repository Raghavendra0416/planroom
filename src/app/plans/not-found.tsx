'use client';

import { BackButton } from '@/frontend/components/ui/BackButton';
import { backToPlans, notFound as notFoundMessage } from '@/frontend/copy';

/**
 * Missing-page message inside the plans segment.
 * @returns The not-found sentence.
 */
export default function PlansNotFound() {
  return (
    <div className="home">
      <div className="page-top">
        <BackButton fallbackHref="/plans" label={backToPlans} />
      </div>
      <p>{notFoundMessage}</p>
    </div>
  );
}
