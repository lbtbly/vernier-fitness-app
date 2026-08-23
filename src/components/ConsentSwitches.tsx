'use client';

import { useState } from 'react';
import { WarnIcon } from '@/components/icons';
import { AI_CATEGORIES, type AiCategory, type ConsentSet } from '@/lib/ai/consent';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * Four switches, and each one is its own request.
 *
 * INDEPENDENT MEANS INDEPENDENT AT EVERY LAYER. Four columns in the database,
 * one category per write in the route, and four controls here that share no
 * state: turning photo analysis off posts photo analysis and nothing else, so
 * two screens open at once cannot undo each other's answers.
 *
 * Each control names what its category sends BEFORE it is switched on, which is
 * F94's "names the exact data categories sent for each kind of analysis before
 * the first send". The list is not a summary written for this screen: it is
 * rendered from the same catalogue block the consent card on screen 09 renders
 * from, so a category that starts sending something new has to say so in both
 * places at once.
 */
export function ConsentSwitches({
  initial,
  csrfToken,
}: {
  initial: ConsentSet;
  csrfToken: string;
}) {
  const [consent, setConsent] = useState<ConsentSet>(initial);
  const [busy, setBusy] = useState<AiCategory | null>(null);
  const [failure, setFailure] = useState<
    | { title: string; detail: string; authored: 'vernier' }
    | { title: string; caught: unknown; authored: 'platform' }
    | null
  >(null);

  async function toggle(category: AiCategory, on: boolean) {
    setBusy(category);
    setFailure(null);
    try {
      const response = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ category, on }),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        consent?: ConsentSet;
        error?: string;
        detail?: string;
      };
      if (!response.ok || !answer.consent) {
        setFailure({
          title: answer.error ?? strings.meals.errorTitle,
          detail: answer.detail ?? strings.meals.errorBodyRest,
          authored: 'vernier',
        });
        return;
      }
      setConsent(answer.consent);
    } catch (error) {
      setFailure({ title: strings.meals.errorTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-consent-switches="open">
      {AI_CATEGORIES.map((category) => {
        const on = consent[category];
        return (
          <section className="card" key={category} data-category={category} data-on={on}>
            <div className="between">
              <div className="stack grow">
                <span className="head">{strings.meals.categories[category]}</span>
                <span className="note">{on ? strings.meals.categoryOn : strings.meals.categoryOff}</span>
              </div>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={on}
                aria-label={
                  on
                    ? strings.meals.toggleOff(strings.meals.categories[category])
                    : strings.meals.toggleOn(strings.meals.categories[category])
                }
                disabled={busy === category}
                data-switch={category}
                onClick={() => void toggle(category, !on)}
              >
                <span className="knob" />
              </button>
            </div>
            <p className="sub" style={{ marginTop: 'var(--s2)' }}>
              {strings.meals.categoryBodies[category]}
            </p>
          </section>
        );
      })}

      {failure ? (
        <div className="card error" role="alert" data-state="error">
          <div className="between">
            <span className="lbl">{strings.meals.consentScreenTitle}</span>
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
    </div>
  );
}
