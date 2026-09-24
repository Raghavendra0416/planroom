'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/frontend/components/ui/button';
import { homeTitle, navHome, navPlans, navQueue, newPlan, signOut } from '@/frontend/copy';
import { useSession } from '@/frontend/contexts/SessionContext';

/**
 * Wordmark and role-aware navigation. Renders no nav when signed out.
 * @returns The site header.
 */
export function SiteHeader() {
  const { actor, refresh } = useSession();
  const router = useRouter();

  async function onSignOut(): Promise<void> {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        return;
      }

      await refresh();
      router.push('/login');
    } catch {
      return;
    }
  }

  return (
    <header className="site-header">
      <Link className="wordmark" href="/">
        {homeTitle}
      </Link>
      {actor ? (
        <nav className="site-nav">
          <Link href="/">{navHome}</Link>
          <Link href="/plans">{navPlans}</Link>
          {actor.role === 'TEACHER' ? <Link href="/plans/new">{newPlan}</Link> : null}
          {actor.role === 'HOD' ? <Link href="/hod">{navQueue}</Link> : null}
          <Button type="button" variant="quiet" onClick={() => void onSignOut()}>
            {signOut}
          </Button>
        </nav>
      ) : null}
    </header>
  );
}
