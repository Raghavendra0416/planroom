'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/frontend/components/ui/button';
import { duplicateEmail, register, registerFail, signIn } from '@/frontend/copy';
import { useSession } from '@/frontend/contexts/SessionContext';

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

/**
 * Teacher registration. A duplicate email and any other failure use the copy sentences.
 * @returns The register form.
 */
export function RegisterPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setFields({});
    setFormError(null);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name, email, password }),
      });
      if (!response.ok) {
        const nextFields = readFields(await readBody(response));
        setFields(nextFields);
        setFormError(hasFieldError(nextFields) ? null : registerFail);
        return;
      }

      await refresh();
      router.push('/plans');
    } catch {
      setFormError(registerFail);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth">
      <h1>{register}</h1>
      <form className="auth-form" noValidate onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor="register-name">
          Name
          <input
            id="register-name"
            name="name"
            type="text"
            autoComplete="name"
            aria-invalid={fields.name ? true : undefined}
            className={fields.name ? 'has-error' : undefined}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {fields.name ? <span className="field-error">{fields.name}</span> : null}
        </label>
        <label htmlFor="register-email">
          Email
          <input
            id="register-email"
            name="email"
            type="email"
            autoCapitalize="none"
            autoComplete="email"
            aria-invalid={fields.email ? true : undefined}
            className={fields.email ? 'has-error' : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {fields.email ? (
            <span className="field-error">{fields.email === duplicateEmail ? duplicateEmail : fields.email}</span>
          ) : null}
        </label>
        <label htmlFor="register-password">
          Password
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={fields.password ? true : undefined}
            className={fields.password ? 'has-error' : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {fields.password ? <span className="field-error">{fields.password}</span> : null}
        </label>
        <Button disabled={pending} type="submit">
          {register}
        </Button>
      </form>
      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      <p className="auth-switch">
        <Link href="/login">{signIn}</Link>
      </p>
    </main>
  );
}

/**
 * Reads field messages from an error payload.
 * @param body - Parsed JSON, which may not be an object.
 * @returns The name, email, and password messages that were strings.
 */
function readFields(body: unknown): FieldErrors {
  if (typeof body !== 'object' || body === null) {
    return {};
  }

  const fields = (body as { fields?: unknown }).fields;
  if (typeof fields !== 'object' || fields === null) {
    return {};
  }

  const record = fields as Record<string, unknown>;
  const next: FieldErrors = {};
  if (typeof record.name === 'string') {
    next.name = record.name;
  }
  if (typeof record.email === 'string') {
    next.email = record.email;
  }
  if (typeof record.password === 'string') {
    next.password = record.password;
  }
  return next;
}

/**
 * Parses a response body. A non-JSON body means there are no field messages.
 * @param response - Failed register response.
 * @returns The parsed JSON, or undefined.
 */
async function readBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Reports whether any register field has a message.
 * @param fields - Messages keyed by field.
 * @returns True when name, email, or password has text.
 */
function hasFieldError(fields: FieldErrors): boolean {
  return Boolean(fields.name || fields.email || fields.password);
}
