'use client';

import { Button } from '@/frontend/components/ui/button';
import { homeLead, homeTitle, navPlans, signIn, step1, step2, step3 } from '@/frontend/copy';
import { useSession } from '@/frontend/contexts/SessionContext';

/**
 * Left-aligned introduction with one primary action for the current session.
 * @returns The home page content.
 */
export function HomePage() {
  const { actor } = useSession();

  return (
    <main className="home">
      <h1>{homeTitle}</h1>
      <p className="lead">{homeLead}</p>
      <p className="step">{step1}</p>
      <p className="step">{step2}</p>
      <p className="step">{step3}</p>
      {actor ? <Button href="/plans">{navPlans}</Button> : <Button href="/login">{signIn}</Button>}
    </main>
  );
}
