'use client';

import { BackButton } from '@/frontend/components/ui/BackButton';
import { Button } from '@/frontend/components/ui/button';
import { backToPlans, genericError, retry } from '@/frontend/copy';

/**
 * Recoverable plans-segment error with the shared failure sentence.
 * @param props - Next.js error boundary props.
 * @param props.reset - Renders the plans segment again.
 * @returns The failure message and retry control.
 */
export default function PlansError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="home">
      <div className="page-top">
        <BackButton fallbackHref="/plans" label={backToPlans} />
      </div>
      <p>{genericError}</p>
      <Button type="button" onClick={() => reset()}>
        {retry}
      </Button>
    </div>
  );
}
