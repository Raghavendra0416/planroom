'use client';

import { BackButton } from '@/frontend/components/ui/BackButton';
import { Button } from '@/frontend/components/ui/button';
import { backToHome, genericError, retry } from '@/frontend/copy';

/**
 * Recoverable page error with the shared failure sentence and retry button.
 * @param props - Next.js error boundary props.
 * @param props.reset - Renders the segment again.
 * @returns The failure message and retry control.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="home">
      <div className="page-top">
        <BackButton fallbackHref="/" label={backToHome} />
      </div>
      <p>{genericError}</p>
      <Button type="button" onClick={() => reset()}>
        {retry}
      </Button>
    </div>
  );
}
