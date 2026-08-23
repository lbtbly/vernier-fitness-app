'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * An edit, and the thing F97 is measured on.
 *
 * It posts a number and a reason and nothing else. There is no field here for
 * the origin, the confidence, the photograph or the call, and no hidden input
 * carrying them: the route reads them off the row being corrected and the
 * database refuses an insert that changes any of them. So after three edits the
 * entry still says estimate, and it says so because there is no way to write a
 * row where it does not.
 *
 * Same shape as `CorrectionForm` on the value sheet, which does this for a
 * measurement. Two components rather than one because the two chains carry
 * different columns and a shared one would have to know about both.
 */
export function EntryCorrection({
  entryId,
  currentKcal,
  csrfToken,
}: {
  entryId: string;
  currentKcal: string;
  csrfToken: string;
}) {
  const router = useRouter();
  const [kcal, setKcal] = useState(currentKcal);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<
    | { title: string; detail: string; authored: 'vernier' }
    | { title: string; caught: unknown; authored: 'platform' }
    | null
  >(null);

  async function save() {
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch('/api/meals/entry', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ action: 'correct', entryId, kcal: Number(kcal), reason }),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        entry?: { id: string };
        error?: string;
        detail?: string;
      };
      if (!response.ok || !answer.entry) {
        setFailure({
          title: answer.error ?? strings.meals.errorTitle,
          detail: answer.detail ?? strings.meals.errorBodyRest,
          authored: 'vernier',
        });
        return;
      }
      setReason('');
      router.push(`/eat/entry/${answer.entry.id}`);
      router.refresh();
    } catch (error) {
      setFailure({ title: strings.meals.errorTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" data-card="correct">
      <span className="lbl">{strings.meals.correctEntry}</span>
      <label className="formfield" htmlFor="entry-kcal" style={{ marginTop: 'var(--s3)' }}>
        <span className="lbl">{strings.meals.correctEnergyLabel}</span>
        <input
          id="entry-kcal"
          className="input num"
          inputMode="numeric"
          value={kcal}
          onChange={(event) => setKcal(event.target.value)}
        />
      </label>
      <label className="formfield" htmlFor="entry-reason">
        <span className="lbl">{strings.meals.correctReasonLabel}</span>
        <input
          id="entry-reason"
          className="input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn primary block"
        disabled={busy}
        data-action="correct"
        onClick={() => void save()}
      >
        {strings.meals.saveCorrection}
      </button>

      {failure ? (
        <div className="card error" role="alert" data-state="error" style={{ marginTop: 'var(--s3)' }}>
          <div className="between">
            <span className="lbl">{strings.meals.entryTitle}</span>
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
