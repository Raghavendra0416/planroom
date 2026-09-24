'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/frontend/components/ui/button';
import { back } from '@/frontend/copy';

/**
 * History-first back button with a fallback destination for direct loads.
 * @param props - Back button props.
 * @param props.fallbackHref - Destination when there is no page history.
 * @param props.label - Accessible name, such as "Back to plans". Visible text stays "Back".
 * @returns A quiet button that goes back or to the fallback.
 */
export function BackButton({ fallbackHref, label }: { fallbackHref: string; label: string }) {
  const router = useRouter();

  function goBack(): void {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  return (
    <Button ariaLabel={label} type="button" variant="quiet" onClick={goBack}>
      {`← ${back}`}
    </Button>
  );
}
