'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/frontend/components/ui/button';
import { hodDemo, loginDemo, register, signIn, signInFail, teacherDemo } from '@/frontend/copy';
import { useSession } from '@/frontend/contexts/SessionContext';

/**
 * Email and password sign-in, plus the demo accounts. The password is not shown.
 * @returns The login form and demo box.
 */
export function LoginPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setFailure(false);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setFailure(true);
        document.getElementById('login-email')?.focus();
        return;
      }

      await refresh();
      router.push('/');
    } catch {
      setFailure(true);
      document.getElementById('login-email')?.focus();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth">
      <h1>{signIn}</h1>
      <form className="auth-form" noValidate onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor="login-email">
          Email
          <input
            id="login-email"
            name="email"
            type="email"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label htmlFor="login-password">
          Password
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button disabled={pending} type="submit">
          {signIn}
        </Button>
      </form>
      {failure ? (
        <p className="form-error" role="alert">
          {signInFail}
        </p>
      ) : null}
      <div className="demo-box">
        <p>{loginDemo}</p>
        <p>{teacherDemo}</p>
        <p>{hodDemo}</p>
      </div>
      <p className="auth-switch">
        <Link href="/register">{register}</Link>
      </p>
    </div>
  );
}
