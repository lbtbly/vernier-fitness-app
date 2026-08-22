import { describe, expect, it } from 'vitest';
import { classifyRoute, isApiRoute, isOpenRoute, shouldIssueCsrfCookie } from '@/lib/routes';

/**
 * The route table the middleware enforces and scripts/route-table.mjs grades.
 * If this drifts, a route stops being protected and nothing else notices.
 */
describe('the route table', () => {
  it('opens exactly the five things an unauthenticated visitor may have', () => {
    for (const path of ['/sign-in', '/healthz', '/offline', '/manifest.webmanifest', '/sw.js']) {
      expect(classifyRoute(path)).toBe('public');
    }
    for (const path of ['/api/diagnostics/device', '/api/diagnostics/launch']) {
      expect(classifyRoute(path)).toBe('public');
    }
    for (const path of ['/icons/icon-192.png', '/_next/static/chunk.js']) {
      expect(classifyRoute(path)).toBe('public');
    }
  });

  it('opens the two diagnostics endpoints by name and nothing else in that namespace', () => {
    // These two are public because four lines of .forge/PREFLIGHT.md curl them
    // from a shell with no session. That was a decision about two endpoints,
    // not about a namespace: a prefix here would hand the same opening to
    // /api/diagnostics/ingest, which slice 12 has yet to write and which nobody
    // has reviewed.
    expect(classifyRoute('/api/diagnostics/device')).toBe('public');
    expect(classifyRoute('/api/diagnostics/launch')).toBe('public');
    for (const path of [
      '/api/diagnostics/anything-else',
      '/api/diagnostics/ingest',
      '/api/diagnostics',
      '/api/diagnostics/device/detail',
    ]) {
      expect(classifyRoute(path)).toBe('protected');
      expect(isOpenRoute(path)).toBe(false);
    }
  });

  it('calls the sign-in endpoints the gate, because they cannot need a session', () => {
    for (const path of [
      '/api/auth/bootstrap',
      '/api/auth/password',
      '/api/auth/passkey/authentication/options',
      '/api/auth/passkey/authentication/verify',
      '/sign-in/recover',
    ]) {
      expect(classifyRoute(path)).toBe('gate');
    }
  });

  it('protects everything else, including a route nobody has written yet', () => {
    for (const path of [
      '/',
      '/health',
      '/train',
      '/eat',
      '/settings',
      '/api/settings/integrations',
      '/api/auth/passkey/registration/options',
      '/api/auth/passkey/registration/verify',
      '/api/auth/sign-out',
      '/api/measurements',
      '/labs/2026-08-21',
      '/anything-invented-in-slice-9',
    ]) {
      expect(classifyRoute(path)).toBe('protected');
      expect(isOpenRoute(path)).toBe(false);
    }
  });

  it('is not fooled by a trailing slash', () => {
    expect(classifyRoute('/sign-in/')).toBe('public');
    expect(classifyRoute('/settings/')).toBe('protected');
  });

  it('answers an API path with a status and a document with a redirect', () => {
    expect(isApiRoute('/api/settings/integrations')).toBe(true);
    expect(isApiRoute('/settings')).toBe(false);
  });

  it('leaves the liveness, offline, worker and diagnostics responses cookie free', () => {
    for (const path of ['/healthz', '/offline', '/sw.js', '/api/diagnostics/device', '/icons/x.png']) {
      expect(shouldIssueCsrfCookie(path)).toBe(false);
    }
    expect(shouldIssueCsrfCookie('/sign-in')).toBe(true);
    expect(shouldIssueCsrfCookie('/settings')).toBe(true);
  });
});
