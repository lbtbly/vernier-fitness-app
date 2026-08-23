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
    expect(classifyRoute('/api/diagnostics/device')).toBe('public');
    for (const path of ['/icons/icon-192.png', '/_next/static/chunk.js']) {
      expect(classifyRoute(path)).toBe('public');
    }
  });

  it('opens the diagnostics read by name, and not the write beside it', () => {
    // The read is public because four lines of .forge/PREFLIGHT.md curl it from
    // a shell with no session. That was a decision about one endpoint, not
    // about a namespace: a prefix here would hand the same opening to
    // /api/diagnostics/ingest, which slice 12 has yet to write and which nobody
    // has reviewed.
    expect(classifyRoute('/api/diagnostics/device')).toBe('public');

    // AND THE WRITE IS PROTECTED, WHICH IT WAS NOT. /api/diagnostics/launch
    // was on the public list, and that made device_observation writable by
    // anything on the tailnet: the verifier set standalone_seen and
    // wake_lock_available true with four lines of curl, no browser and no
    // session, using an anti-forgery pair minted by one unauthenticated GET of
    // /sign-in. That row is C2's evidence. Nothing curls the write, only the
    // owner's own launch raises it, and the owner has a session.
    expect(classifyRoute('/api/diagnostics/launch')).toBe('protected');
    expect(isOpenRoute('/api/diagnostics/launch')).toBe(false);

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

  it('calls the Withings callback a gate route, because a strict cookie cannot reach it', () => {
    // The session cookie is SameSite=Strict, which is right and stays. A
    // top-level navigation from account.withings.com is cross-site, so the
    // browser sends no cookie with it and a protected route would answer the
    // owner's own consent with a 401 while the 30-second authorization code
    // expired. What stands in for the session is the `state` this app minted,
    // compared in constant time against the SHA-256 on the connection row.
    expect(classifyRoute('/api/withings/callback')).toBe('gate');
    expect(isOpenRoute('/api/withings/callback')).toBe(true);

    // And it is one path, not a namespace. Everything else Withings is behind
    // the session like every other write in this app.
    for (const path of ['/api/withings', '/api/withings/sync', '/api/withings/callback/extra']) {
      expect(classifyRoute(path)).toBe('protected');
      expect(isOpenRoute(path)).toBe(false);
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
