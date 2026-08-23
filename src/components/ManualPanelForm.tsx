'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { analyteLabel, unitSymbol } from '@/lib/lab-display';
import type { Analyte } from '@/lib/labs';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * The manual panel, F57's structured form, and the reason it does not save.
 *
 * Thirteen analytes with a result, a unit, a reference interval and a date is
 * exactly the form the line describes, and the obvious build ends in one Save
 * that writes thirteen rows. That is the batch commit F59 forbids wearing a
 * different hat. So this form BUILDS A REVIEW: the typed values become the same
 * candidate rows a parsed PDF produces, on the same screen, and each one is
 * still saved on its own control.
 *
 * The button says so. It reads "Build the review" and not "Save", and the route
 * it calls answers `stored: 0`.
 *
 * The unit picker is a select over the units this analyte accepts rather than a
 * free field, because a unit typed off a sheet is a word on a screen with no
 * catalogue key, which is C6's second clause failing the day it is used.
 */

const MANUAL_ENDPOINT = '/api/labs/manual';

type Failure =
  | { error: string; detail: string; authored: 'vernier' }
  | { error: string; caught: unknown; authored: 'platform' };

type Entry = { printedValue: string; printedUnit: string; referenceLow: string; referenceHigh: string };

export function ManualPanelForm({
  analytes,
  csrfToken,
  today,
}: {
  analytes: Analyte[];
  csrfToken: string;
  /** The day key the date field opens on, computed on the server in the app's zone. */
  today: string;
}) {
  const router = useRouter();
  const [sampleDate, setSampleDate] = useState(today);
  const [laboratory, setLaboratory] = useState('');
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      analytes.map((analyte) => [
        analyte.key,
        { printedValue: '', printedUnit: analyte.unit, referenceLow: '', referenceHigh: '' },
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  function update(key: string, patch: Partial<Entry>) {
    setEntries((held) => ({ ...held, [key]: { ...held[key], ...patch } }));
  }

  const filled = analytes.filter((analyte) => entries[analyte.key]?.printedValue.trim() !== '').length;

  async function build() {
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch(MANUAL_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({
          sampleDate,
          laboratory,
          entries: analytes
            .filter((analyte) => entries[analyte.key].printedValue.trim() !== '')
            .map((analyte) => ({ analyte: analyte.key, ...entries[analyte.key] })),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
        detail?: string;
      };
      if (!response.ok || !body.id) {
        setFailure({
          error: body.error ?? strings.api.labs.failed,
          detail: body.detail ?? strings.api.labs.failedDetail,
          authored: 'vernier',
        });
        return;
      }
      router.push(`/health/labs/${body.id}`);
      router.refresh();
    } catch (error) {
      setFailure({ error: strings.api.labs.failed, caught: error, authored: 'platform' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card" data-card="manual-header">
        <span className="lbl">{strings.labs.manualDateLabel}</span>
        <input
          className="input num"
          type="date"
          aria-label={strings.labs.manualDateLabel}
          value={sampleDate}
          onChange={(event) => setSampleDate(event.target.value)}
          style={{ marginTop: 'var(--s2)' }}
        />
        <label className="formfield" htmlFor="manual-lab" style={{ marginTop: 'var(--s3)' }}>
          <span className="lbl">{strings.provenance.fields['source.field.laboratory']}</span>
          <input
            id="manual-lab"
            className="input"
            value={laboratory}
            onChange={(event) => setLaboratory(event.target.value)}
          />
        </label>
        <p className="note">{strings.labs.manualRowNote}</p>
      </section>

      <section className="card" data-card="manual-rows">
        {analytes.map((analyte) => {
          const entry = entries[analyte.key];
          const name = analyteLabel(analyte);
          return (
            <div className="manualrow" key={analyte.key} data-analyte={analyte.key}>
              <span className="strong">{name}</span>
              <div className="fields">
                <label>
                  <span className="visually-hidden">{strings.labs.resultLabel}</span>
                  <input
                    className="input num"
                    inputMode="decimal"
                    aria-label={`${name} ${strings.labs.resultLabel}`}
                    value={entry.printedValue}
                    onChange={(event) => update(analyte.key, { printedValue: event.target.value })}
                  />
                </label>
                <label>
                  <span className="visually-hidden">{strings.labs.unitLabel}</span>
                  <select
                    className="input"
                    aria-label={`${name} ${strings.labs.unitLabel}`}
                    value={entry.printedUnit}
                    onChange={(event) => update(analyte.key, { printedUnit: event.target.value })}
                  >
                    {analyte.printed.map((printed) => (
                      <option key={printed.unit} value={printed.unit}>
                        {unitSymbol(printed.unit)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="fields">
                <label>
                  <span className="visually-hidden">{strings.labs.referenceLowLabel}</span>
                  <input
                    className="input num"
                    inputMode="decimal"
                    aria-label={`${name} ${strings.labs.referenceLowLabel}`}
                    value={entry.referenceLow}
                    onChange={(event) => update(analyte.key, { referenceLow: event.target.value })}
                  />
                </label>
                <label>
                  <span className="visually-hidden">{strings.labs.referenceHighLabel}</span>
                  <input
                    className="input num"
                    inputMode="decimal"
                    aria-label={`${name} ${strings.labs.referenceHighLabel}`}
                    value={entry.referenceHigh}
                    onChange={(event) => update(analyte.key, { referenceHigh: event.target.value })}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </section>

      {failure ? (
        <div className="card error" data-state="error" role="alert">
          <div className="between">
            <span className="lbl">{strings.labs.manualTitle}</span>
            <span className="chip a">
              <WarnIcon />
              {strings.error.failedChip}
            </span>
          </div>
          <div className="head">{failure.error}</div>
          <p className="sub">
            {failure.authored === 'platform' ? (
              <span data-authored="platform" ref={carryTheCaughtObject(failure.caught)}>
                {messageOf(failure.caught)}
              </span>
            ) : (
              <span data-authored="vernier">{failure.detail}</span>
            )}
          </p>
          <div className="actions">
            <button type="button" className="btn grow" onClick={() => setFailure(null)}>
              {strings.error.action}
            </button>
          </div>
        </div>
      ) : null}

      <div className="stickybar">
        <button
          type="button"
          className="btn primary block"
          disabled={busy || filled === 0}
          /*
           * This control writes NOTHING. It builds a review holding, which is
           * why it says "Build the review" and why the census a test walks reads
           * "none" here: there is no ordinal it could apply.
           */
          data-writes="none"
          onClick={() => void build()}
        >
          {busy ? strings.labs.saving : strings.labs.manualBuild}
        </button>
        <p className="note centre" style={{ marginTop: 'var(--s2)' }}>
          {filled === 0 ? strings.labs.manualNothing : strings.labs.manualNote}
        </p>
      </div>
    </>
  );
}
