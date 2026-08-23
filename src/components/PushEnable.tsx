'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { LAST_POSTED_KEY, fromBase64Url, toBase64Url } from '@/lib/push/subscription';
import { strings } from '@/lib/strings';

/**
 * The tap that turns notifications on, and the ordering that makes it work.
 *
 * ================================================================
 * READ THIS BEFORE MOVING A LINE IN `enable`.
 *
 * User activation on iOS is TRANSIENT. Apple: "When the user completes the
 * gesture, call the push subscription method immediately from the gesture's
 * event handler code." WebKit: requesting a push subscription "requires an
 * explicit user gesture".
 *
 * An `await` before `Notification.requestPermission()` spends that activation,
 * and the prompt then NEVER APPEARS. It does not throw. It does not warn. The
 * promise resolves to 'default' and the owner taps a button that appears to do
 * nothing, forever. This is the single most common way this feature ships
 * broken, and it is invisible to every test that does not run on a real
 * iPhone.
 *
 * SO THE ORDER IS WRITTEN AS CODE THAT CANNOT BE REORDERED:
 *
 *   1. The worker is registered at module load by <ServiceWorker/> in the root
 *      layout, long before this button exists. `navigator.serviceWorker.ready`
 *      is therefore already resolved by the time anybody taps.
 *   2. `requestPermission()` is the FIRST STATEMENT of the handler. Not the
 *      first await: the first statement. Nothing is read, nothing is fetched,
 *      no state is set, and no lint rule or refactor can move something above
 *      it without the sentence above it having to be deleted first.
 *   3. Everything else happens after the permission answer, by which point the
 *      activation has already been spent on the prompt that needed it.
 *
 * `tests/unit/push-handler.test.ts` reads this file's source and asserts that
 * the first statement inside `enable` is the permission request, because a
 * comment is not a check.
 * ================================================================
 */

type Phase = 'idle' | 'asking' | 'enabled' | 'denied' | 'dismissed' | 'failed';

export function PushEnable({
  csrfToken,
  applicationServerKey,
  subscribed,
}: {
  csrfToken: string;
  /** The PUBLIC half, and the only half that ever reaches a browser. */
  applicationServerKey: string | null;
  subscribed: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(subscribed ? 'enabled' : 'idle');
  const [detail, setDetail] = useState<string | null>(null);

  /*
   * Whether this browser can do it at all.
   *
   * In an iOS Safari tab the Notification interface is undefined and its
   * constructor throws a ReferenceError; from the Home Screen icon on the same
   * device, same iOS, it is there. That is the number one support question this
   * feature generates, so the button is not drawn where it cannot work and the
   * card says what to do instead.
   *
   * Read through `useSyncExternalStore` and not in an effect, following
   * `useJustLogged` in src/components/Queue.tsx, which is this repository's
   * pattern for a browser fact the server cannot know. The server snapshot is
   * `true`: the machine that rendered the markup genuinely does not know what
   * the browser has, so it draws the control and the first client read narrows
   * it. The subscribe callback is a no-op because this fact does not change
   * during a document's life; what changes it is opening the app from a
   * different icon, which is a different document.
   */
  const supported = useSyncExternalStore(
    () => () => {},
    () =>
      typeof Notification !== 'undefined' &&
      typeof PushManager !== 'undefined' &&
      'serviceWorker' in navigator,
    () => true,
  );

  const enable = useCallback(() => {
    // FIRST STATEMENT. Synchronous. Nothing above it, ever. See the block
    // comment at the top of this file.
    const permission = Notification.requestPermission();

    void (async () => {
      setPhase('asking');
      setDetail(null);
      const answer = await permission;
      if (answer === 'denied') {
        setPhase('denied');
        return;
      }
      if (answer !== 'granted') {
        setPhase('dismissed');
        return;
      }
      if (!applicationServerKey) {
        setPhase('failed');
        setDetail(strings.push.noKeysDetail);
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          // Mandatory, and it is a promise rather than a flag: a worker that
          // receives a push and shows nothing has its subscription revoked.
          userVisibleOnly: true,
          applicationServerKey: fromBase64Url(applicationServerKey),
        });
        const raw = subscription.toJSON();
        const posted = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken },
          body: JSON.stringify({
            subscription: {
              endpoint: subscription.endpoint,
              keys: { p256dh: raw.keys?.p256dh ?? '', auth: raw.keys?.auth ?? '' },
              applicationServerKey: subscription.options.applicationServerKey
                ? toBase64Url(subscription.options.applicationServerKey as ArrayBuffer)
                : applicationServerKey,
            },
          }),
        });
        if (!posted.ok) {
          const answerBody = (await posted.json().catch(() => ({}))) as { detail?: string };
          setPhase('failed');
          setDetail(answerBody.detail ?? strings.push.subscribeFailedBody);
          return;
        }
        try {
          localStorage.setItem(LAST_POSTED_KEY, subscription.endpoint);
        } catch {
          // Storage refused. The launch check re-posts next time, which costs
          // one request and nothing else.
        }
        setPhase('enabled');
      } catch (error) {
        setPhase('failed');
        setDetail((error as Error).message);
      }
    })();
  }, [applicationServerKey, csrfToken]);

  const forget = useCallback(() => {
    void (async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setPhase('idle');
        return;
      }
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ action: 'forget', endpoint: subscription.endpoint }),
      }).catch(() => undefined);
      await subscription.unsubscribe().catch(() => undefined);
      try {
        localStorage.removeItem(LAST_POSTED_KEY);
      } catch {
        // See above.
      }
      setPhase('idle');
    })();
  }, [csrfToken]);

  if (!supported) {
    return (
      <div className="card empty" data-state="empty" data-push="unsupported">
        <div className="head">{strings.push.unsupportedTitle}</div>
        <p className="sub">{strings.push.unsupportedBody}</p>
      </div>
    );
  }

  return (
    <section className="card" data-push={phase}>
      <span className="lbl">{strings.push.title}</span>
      <div className="head">
        {phase === 'enabled' ? strings.push.enabled : strings.push.enableTitle}
      </div>
      <p className="sub">{phase === 'enabled' ? strings.push.enabledBody : strings.push.enableBody}</p>

      {phase === 'denied' ? (
        <div className="card error" data-state="error" style={{ marginTop: 'var(--s3)' }}>
          <div className="head" style={{ marginTop: 0 }}>
            {strings.push.deniedTitle}
          </div>
          <p className="sub">{strings.push.deniedBody}</p>
        </div>
      ) : null}

      {phase === 'dismissed' ? (
        <div className="card" data-state="empty" style={{ marginTop: 'var(--s3)' }}>
          <div className="head" style={{ marginTop: 0 }}>
            {strings.push.dismissedTitle}
          </div>
          <p className="sub">{strings.push.dismissedBody}</p>
        </div>
      ) : null}

      {phase === 'failed' ? (
        <div className="card error" data-state="error" style={{ marginTop: 'var(--s3)' }}>
          <div className="head" style={{ marginTop: 0 }}>
            {strings.push.subscribeFailedTitle}
          </div>
          <p className="sub">{detail ?? strings.push.subscribeFailedBody}</p>
        </div>
      ) : null}

      <div className="actions">
        {phase === 'enabled' ? (
          <button type="button" className="btn block" data-push-action="forget" onClick={forget}>
            {strings.push.disable}
          </button>
        ) : (
          <button
            type="button"
            className="btn primary block"
            data-push-action="enable"
            disabled={phase === 'asking'}
            onClick={enable}
          >
            {phase === 'asking' ? strings.push.enabling : strings.push.enable}
          </button>
        )}
      </div>
    </section>
  );
}
