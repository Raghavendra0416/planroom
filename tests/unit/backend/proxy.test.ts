import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';

function request(pathname: string, cookie?: string): NextRequest {
  const headers = cookie ? { cookie } : undefined;
  return new NextRequest(`http://localhost:3000${pathname}`, { headers });
}

function location(pathname: string, cookie?: string): string | null {
  return proxy(request(pathname, cookie)).headers.get('location');
}

describe('auth proxy', () => {
  it('redirects plan and review pages when the session cookie is missing', () => {
    expect(location('/plans')).toBe('http://localhost:3000/login');
    expect(location('/plans/new')).toBe('http://localhost:3000/login');
    expect(location('/hod')).toBe('http://localhost:3000/login');
    expect(location('/hod/queue')).toBe('http://localhost:3000/login');
  });

  it('sends signed-out visitors from home to login', () => {
    expect(location('/')).toBe('http://localhost:3000/login');
    expect(location('/', 'planroom_session=token')).toBeNull();
  });

  it('does not redirect public pages, auth API routes, or a request that has the cookie', () => {
    expect(location('/login')).toBeNull();
    expect(location('/register')).toBeNull();
    expect(location('/api/auth/login')).toBeNull();
    expect(location('/api/auth/session')).toBeNull();
    expect(location('/plans', 'planroom_session=token')).toBeNull();
    expect(location('/hod', 'planroom_session=token')).toBeNull();
    expect(location('/plans', 'planroom_session=')).toBe('http://localhost:3000/login');
  });
});
