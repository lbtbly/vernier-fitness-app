'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * The first generation of a week, and the cooking limit it is generated under.
 *
 * The limit is a field rather than a fixed number because F86 measures the
 * generator against it: two generations at 20 and 60 minutes have to produce
 * different menus and neither may exceed its own limit. It is typed, not
 * chosen from a list, so a verifier can put any number in it.
 */

type Failure =
  | { title: string; detail: string; authored: 'vernier' }
  | { title: string; caught: unknown; authored: 'platform' };

const ENDPOINT = '/api/nutrition/plan';

export function GenerateWeek({
  csrfToken,
  maxCookMinutes,
}: {
  csrfToken: string;
  maxCookMinutes: number;
}) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(String(maxCookMinutes));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function generate() {
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ action: 'generate', maxCookMinutes: Number(minutes) }),
      });
      if (!response.ok) {
        const answer = (await response.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        setFailure({
          title: answer.error ?? strings.nutrition.weekErrorTitle,
          detail: answer.detail ?? strings.api.nutrition.bodyDetail,
          authored: 'vernier',
        });
        return;
      }
      router.push('/eat');
      router.refresh();
    } catch (error) {
      setFailure({ title: strings.nutrition.weekErrorTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" data-card="generate">
      <label className="formfield" htmlFor="generate-max-cook">
        <span className="lbl">{strings.nutrition.maxCookLabel}</span>
        <input
          id="generate-max-cook"
          className="input num"
          inputMode="numeric"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
        />
      </label>
      <p className="note">{strings.nutrition.maxCookNote}</p>
      <button
        type="button"
        className="btn primary block"
        disabled={busy}
        data-control="generate-week"
        onClick={() => void generate()}
        style={{ marginTop: 'var(--s3)' }}
      >
        {busy ? strings.nutrition.generating : strings.nutrition.generateWeek}
      </button>
      {failure ? (
        <div className="card error" role="alert" data-state="error" style={{ marginTop: 'var(--s3)' }}>
          <div className="between">
            <span className="lbl">{strings.tabs.eat}</span>
            <span className="chip a">
              <WarnIcon />
              {strings.error.failedChip}
            </span>
          </div>
          <div className="head">{failure.title}</div>
          <p className="sub">
            {failure.authored === 'platform' ? (
              <span data-authored="platform" ref={carryTheCaughtObject(failure.caught)}>
                {messageOf(failure.caught)}
              </span>
            ) : (
              <span data-authored="vernier">{failure.detail}</span>
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}
