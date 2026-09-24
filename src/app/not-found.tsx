'use client';

import { BackButton } from '@/frontend/components/ui/BackButton';
import { backToHome, notFound as notFoundMessage } from '@/frontend/copy';

/**
 * Missing-page message for unknown URLs.
 * @returns The not-found sentence.
 */
export default function NotFound() {
  return (
    <div className="home">
      <div className="page-top">
        <BackButton fallbackHref="/" label={backToHome} />
      </div>
      <p>{notFoundMessage}</p>
    </div>
  );
}
