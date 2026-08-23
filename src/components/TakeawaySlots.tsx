'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * Two takeaway slots, and a link that opens a search page.
 *
 * WHAT IS NOT ON THIS SCREEN IS THE FEATURE. No restaurant, no menu item, no
 * price, no photograph of a dish and no item-level link, because none of them
 * can be obtained lawfully: the provider publishes no consumer API and no
 * deep-link format, and its terms prohibit scraping. The card says so in one
 * line rather than leaving the owner to wonder why it is so plain.
 *
 * The energy is a band computed off the food table for the dish type, badged as
 * an estimate. Where the rows are not there it says unknown, which is the same
 * rule every other number in this product follows.
 */

export type Slot = {
  position: number;
  dishId: string;
  dishName: string;
  searchUrl: string;
  energy: { low: number; high: number } | null;
  budgetKcal: number | null;
};

export function TakeawaySlots({
  slots,
  csrfToken,
  canPropose,
}: {
  slots: Slot[];
  csrfToken: string;
  canPropose: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<
    | { title: string; detail: string; authored: 'vernier' }
    | { title: string; caught: unknown; authored: 'platform' }
    | null
  >(null);

  async function propose() {
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch('/api/meals/takeaway', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({}),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!response.ok) {
        setFailure({
          title: body.error ?? strings.meals.errorTitle,
          detail: body.detail ?? strings.meals.errorBodyRest,
          authored: 'vernier',
        });
        return;
      }
      router.refresh();
    } catch (error) {
      setFailure({ title: strings.meals.errorTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-takeaway="open">
      {slots.length === 0 ? (
        <div className="card empty" data-state="empty">
          <span className="lbl">{strings.meals.takeawayTitle}</span>
          <div className="head">{strings.meals.takeawayEmptyTitle}</div>
          <p className="sub">{strings.meals.takeawayEmptyBody}</p>
          <div className="actions">
            <button
              type="button"
              className="btn primary block"
              disabled={busy || !canPropose}
              data-action="propose"
              onClick={() => void propose()}
            >
              {strings.meals.takeawayTitle}
            </button>
          </div>
        </div>
      ) : (
        <section className="card" data-card="takeaway">
          <div className="between" style={{ marginBottom: 'var(--s2)' }}>
            <span className="lbl">{strings.meals.takeawayTitle}</span>
            <span className="src est">{strings.meals.estimateChip}</span>
          </div>
          {slots.map((slot) => (
            <div className="row" key={slot.position} data-slot={slot.position} data-dish={slot.dishId}>
              <div className="stack grow">
                <span className="head">{slot.dishName}</span>
                <span className="note num">
                  {slot.energy === null
                    ? strings.meals.takeawayEnergyUnknown
                    : strings.meals.takeawayEnergy(String(slot.energy.low), String(slot.energy.high))}
                </span>
                {slot.budgetKcal === null ? null : (
                  <span className="note">{strings.meals.takeawayWhy(String(slot.budgetKcal))}</span>
                )}
              </div>
              <a
                className="btn"
                href={slot.searchUrl}
                target="_blank"
                rel="noreferrer noopener"
                data-search="true"
              >
                {strings.meals.takeawayOpen(slot.dishName)}
              </a>
            </div>
          ))}
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.meals.takeawaySearchNote}
          </p>
          <p className="note">{strings.meals.takeawayNoMenu}</p>
          <div className="actions">
            <button
              type="button"
              className="btn quiet"
              disabled={busy || !canPropose}
              data-action="propose"
              onClick={() => void propose()}
            >
              {strings.nutrition.regenerate}
            </button>
          </div>
        </section>
      )}

      {failure ? (
        <div className="card error" role="alert" data-state="error">
          <div className="between">
            <span className="lbl">{strings.meals.takeawayTitle}</span>
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
