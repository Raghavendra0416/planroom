'use client';

import { Button } from '@/frontend/components/ui/button';
import { genericError, retry } from '@/frontend/copy';

/**
 * Recoverable plans-segment error with the shared failure sentence.
 * @param props - Next.js error boundary props.
 * @param props.reset - Renders the plans segment again.
 * @returns The failure message and retry control.
 */
export default function PlansError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="home">
      <p>{genericError}</p>
      <Button type="button" onClick={() => reset()}>
        {retry}
      </Button>
    </main>
  );
}
