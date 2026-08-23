'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloseIcon, OkIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import {
  PUSH_CHECK_COUNT,
  type PushCheckRow,
  type PushFacts,
  firstFailure,
  platformVersionOf,
  pushDiagnostics,
} from '@/lib/push/diagnostics';
import { toBase64Url } from '@/lib/push/subscription';
import { strings } from '@/lib/strings';

/**
 * Eleven rows, each with its own remedy, and only the first failure is
 * answered.
 *
 * A phone opened in a Safari tab fails secure context, installed state, the
 * Notification interface, permission, the subscription, the key match and the
 * server's knowledge of it, all at once. Seven red rows teach nobody anything.
 * One remedy, for the first thing that is wrong, and everything below it says
 * "not checked" rather than passing or failing, because its answer would be
 * meaningless until the row above it is fixed. Reporting a check that did not
 * run as a pass is the failure this project has now found seven times.
 *
 * WHAT THIS COMPONENT DOES AND DOES NOT DO. It gathers browser facts and hands
 * them to `pushDiagnostics`, which is pure and holds the ordering and the stop
 * rule. Nothing here decides anything, so the rule is graded in the unit suite
 * with no browser at all.
 */

const LOADING: PushFacts = {
  secureContext: false,
  standalone: false,
  notificationApi: false,
  platformVersion: null,
  permission: 'unavailable',
  workerState: 'none',
  localEndpoint: null,
  localApplicationServerKey: null,
  serverApplicationServerKey: null,
  serverKnowsEndpoint: null,
  lastStatus: null,
  lastStatusAt: null,
  badgeWorks: false,
};

type ServerAnswer = {
  applicationServerKey: string | null;
  known: boolean;
  lastStatus: number | null;
  lastStatusAt: string | null;
};

async function gather(csrfToken: string): Promise<PushFacts> {
  const secureContext = window.isSecureContext;
  const legacyStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || legacyStandalone;
  const notificationApi = typeof Notification !== 'undefined';
  const permission: PushFacts['permission'] = notificationApi
    ? (Notification.permission as PushFacts['permission'])
    : 'unavailable';

  let workerState: PushFacts['workerState'] = 'none';
  let localEndpoint: string | null = null;
  let localApplicationServerKey: string | null = null;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration().catch(() => null);
    if (registration?.active) workerState = 'active';
    else if (registration?.installing) workerState = 'installing';
    else if (registration?.waiting) workerState = 'waiting';
    const subscription = await registration?.pushManager.getSubscription().catch(() => null);
    if (subscription) {
      localEndpoint = subscription.endpoint;
      const key = subscription.options.applicationServerKey;
      if (key) localApplicationServerKey = toBase64Url(key as ArrayBuffer);
    }
  }

  // One request, three answers, and the two rows that earn this screen its
  // keep: whether the Mac mini holds THIS endpoint, and what the push service
  // said about the last send to it.
  const answer = (await fetch('/api/push/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken },
    body: JSON.stringify({ endpoint: localEndpoint }),
  })
    .then((response) => (response.ok ? (response.json() as Promise<ServerAnswer>) : null))
    .catch(() => null)) as ServerAnswer | null;

  let badgeWorks = true;
  try {
    const badging = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (badging.setAppBadge) {
      await badging.setAppBadge(1);
      await badging.clearAppBadge?.();
    } else {
      badgeWorks = false;
    }
  } catch {
    badgeWorks = false;
  }

  return {
    secureContext,
    standalone,
    notificationApi,
    platformVersion: platformVersionOf(navigator.userAgent),
    permission,
    workerState,
    localEndpoint,
    localApplicationServerKey,
    serverApplicationServerKey: answer?.applicationServerKey ?? null,
    serverKnowsEndpoint: answer === null ? null : answer.known,
    lastStatus: answer?.lastStatus ?? null,
    lastStatusAt: answer?.lastStatusAt ?? null,
    badgeWorks,
  };
}

function Row({ row, answered }: { row: PushCheckRow; answered: boolean }) {
  return (
    <div className="row" data-check={row.id} data-check-state={row.state}>
      <span className="tap" aria-hidden="true">
        {row.state === 'passed' ? <OkIcon /> : row.state === 'failed' ? <CloseIcon /> : null}
      </span>
      <div className="stack grow">
        <span>{row.label}</span>
        <span className="note">
          {row.state === 'not-checked' ? strings.push.rowNotChecked : row.detail}
        </span>
        {answered ? (
          <span className="sub" data-remedy>
            {strings.push.remedyLabel}. {row.remedy}
          </span>
        ) : null}
      </div>
      <span className={row.state === 'failed' ? 'chip a' : 'chip'}>
        {row.state === 'passed'
          ? strings.push.rowPassed
          : row.state === 'failed'
            ? strings.push.rowFailed
            : strings.push.rowNotChecked}
      </span>
    </div>
  );
}

export function PushDiagnostics({ csrfToken }: { csrfToken: string }) {
  const [facts, setFacts] = useState<PushFacts | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const refresh = useCallback(() => {
    void gather(csrfToken).then(setFacts);
  }, [csrfToken]);

  useEffect(refresh, [refresh]);

  const sendTest = useCallback(() => {
    setTesting(true);
    setTestResult(null);
    void fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken },
      body: JSON.stringify({}),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          detail?: string;
          sent?: number;
        };
        setTestResult(
          response.ok
            ? { ok: true, detail: strings.push.testSent }
            : { ok: false, detail: body.detail ?? strings.api.push.sendFailed },
        );
      })
      .catch(() => setTestResult({ ok: false, detail: strings.api.push.sendFailed }))
      .finally(() => {
        setTesting(false);
        refresh();
      });
  }, [csrfToken, refresh]);

  // The loading state is the real geometry with nothing decided yet: eleven
  // rows at their final size, not a spinner and not a shorter list that jumps.
  const rows = pushDiagnostics(facts ?? LOADING);
  const failure = facts === null ? null : firstFailure(rows);
  const allPass = facts !== null && failure === null;

  return (
    <>
      <section
        className="card"
        data-push-diagnostics={facts === null ? 'loading' : allPass ? 'pass' : 'fail'}
        data-state={facts === null ? 'loading' : undefined}
        aria-busy={facts === null}
      >
        <span className="lbl">{strings.push.diagnosticsTitle}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.push.diagnosticsBody}
        </p>
        <p className="note" style={{ marginTop: 'var(--s2)' }} data-check-count={PUSH_CHECK_COUNT}>
          {allPass
            ? strings.push.diagnosticsAllPass
            : failure
              ? strings.push.diagnosticsStopped(failure.label)
              : strings.common.loading}
        </p>
        <div style={{ marginTop: 'var(--s3)' }}>
          {rows.map((row) => (
            <Row key={row.id} row={row} answered={failure?.id === row.id} />
          ))}
        </div>
      </section>

      <section className="card flat" style={{ borderStyle: 'dashed' }}>
        <span className="lbl">{strings.push.focusTitle}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.push.focusBody}
        </p>
      </section>

      <section className="card">
        <span className="lbl">{strings.push.sendTest}</span>
        {testResult?.ok ? (
          <p className="sub" data-test-result="ok" style={{ marginTop: 'var(--s2)' }}>
            {testResult.detail}
          </p>
        ) : null}
        {testResult && !testResult.ok ? (
          <div
            className="card error"
            data-state="error"
            data-test-result="failed"
            style={{ marginTop: 'var(--s3)', marginBottom: 0 }}
          >
            <div className="head" style={{ marginTop: 0 }}>
              {strings.api.push.sendFailed}
            </div>
            <p className="sub">{testResult.detail}</p>
          </div>
        ) : null}
        <div className="actions">
          <button
            type="button"
            className="btn block"
            data-push-action="test"
            disabled={testing}
            onClick={sendTest}
          >
            {testing ? strings.common.loading : strings.push.sendTest}
          </button>
        </div>
      </section>
    </>
  );
}
