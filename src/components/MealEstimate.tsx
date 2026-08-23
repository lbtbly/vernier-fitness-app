'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { MacroLine } from '@/components/Macros';
import { CameraIcon, CloseIcon, EditIcon, PlusIcon, ShieldIcon, SparkIcon, WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { LONG_EDGE_PX, downscaleToJpeg } from '@/lib/downscale';
import { allAliases, aliasNameById } from '@/lib/food-aliases';
import type { MacroSet } from '@/lib/macros';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * Screen 09, frames 1 and 2, and the sequence between them.
 *
 * THE ORDER ON THIS SCREEN IS THE ORDER IN THE LINE. The consent card is drawn
 * before a photograph can be chosen. The photograph is downscaled and
 * re-encoded here, on the device, before a request exists, and what is shown
 * under the preview is the size that will actually be sent. Only then is there
 * a Send control, and only then is anything transmitted.
 *
 * NOTHING ON THIS SCREEN IS STORED. The estimate lives in this component's
 * state; the photograph is in a holding on the machine with no row pointing at
 * it. Leaving writes nothing, which is F96, and the screen says so in as many
 * words rather than leaving the owner to guess.
 *
 * EVERY PORTION IS A RANGE AND THERE IS NO CONTROL THAT MAKES IT A POINT. The
 * two ends come from the server, the only editing controls are "weigh this
 * line" and "remove it", and a weighed line is drawn as weighed rather than as
 * an estimate that got lucky.
 */

type Item = {
  aliasId: string;
  name: string | null;
  gramsLow: number;
  gramsHigh: number;
  exactGrams: number | null;
  evidence: 'photo' | 'named_portion' | 'weighed';
};

type Totals = {
  low: MacroSet;
  high: MacroSet;
  mid: MacroSet;
  coveragePct: number;
  unresolvedCount: number;
  estimated: boolean;
};

type Holding = {
  photoId: string;
  callId: string;
  mode: 'demo' | 'live';
  model: string;
  slot: string;
  note: string;
  unresolved: number;
  items: Item[];
  totals: Totals;
  costUsd: number;
};

type Failure =
  | { title: string; detail: string; authored: 'vernier' }
  | { title: string; caught: unknown; authored: 'platform' };

type Prepared = { blob: Blob; width: number; height: number; kilobytes: number };

const EMPTY: MacroSet = { kcal: null, proteinG: null, carbG: null, fatG: null, fibreG: null };

const ESTIMATE_ENDPOINT = '/api/meals/estimate';
const ENTRY_ENDPOINT = '/api/meals/entry';

export function MealEstimate({
  csrfToken,
  consented,
  slot,
  costLine,
  monthLine,
}: {
  csrfToken: string;
  consented: boolean;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  costLine: string;
  monthLine: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [holding, setHolding] = useState<Holding | null>(null);
  const [busy, setBusy] = useState<'photo' | 'send' | 'save' | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [weighing, setWeighing] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [adding, setAdding] = useState(false);
  const [typing, setTyping] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [newGrams, setNewGrams] = useState('');

  const items = holding?.items ?? [];
  const totals = holding?.totals;

  async function prepare(file: File) {
    setBusy('photo');
    setFailure(null);
    try {
      // Step 1 of the mandatory sequence, and it happens here, in the browser,
      // before any request exists.
      const shrunk = await downscaleToJpeg(file, LONG_EDGE_PX);
      setPrepared({
        blob: shrunk.blob,
        width: shrunk.width,
        height: shrunk.height,
        kilobytes: Math.round(shrunk.blob.size / 1024),
      });
    } catch (error) {
      setFailure({ title: strings.meals.photoRejectedTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!prepared) return;
    setBusy('send');
    setFailure(null);
    try {
      const form = new FormData();
      form.append('photo', prepared.blob, 'meal.jpg');
      form.append('slot', slot);
      const response = await fetch(ESTIMATE_ENDPOINT, {
        method: 'POST',
        headers: { [CSRF_HEADER]: csrfToken },
        body: form,
      });
      const answer = (await response.json().catch(() => ({}))) as {
        holding?: Holding;
        error?: string;
        detail?: string;
      };
      if (!response.ok || !answer.holding) {
        setFailure({
          title: answer.error ?? strings.meals.errorTitle,
          detail: answer.detail ?? strings.meals.errorBodyRest,
          authored: 'vernier',
        });
        return;
      }
      setHolding(answer.holding);
    } catch (error) {
      setFailure({ title: strings.meals.unavailableTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(null);
    }
  }

  /**
   * The totals, recomputed on the machine that holds the food table.
   *
   * Every edit goes through here: weighing a line narrows its band, removing
   * one takes its energy out, adding one puts energy in. The screen never does
   * this arithmetic itself, so the figure on the Save button is the figure the
   * confirm route will store and not a second opinion about it.
   */
  async function refreshTotals(next: Item[]) {
    try {
      const response = await fetch(ENTRY_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ action: 'preview', items: next }),
      });
      const answer = (await response.json().catch(() => ({}))) as { totals?: Totals };
      if (response.ok && answer.totals) {
        setHolding((held) => (held ? { ...held, items: next, totals: answer.totals as Totals } : held));
      }
    } catch (error) {
      setFailure({ title: strings.meals.errorTitle, caught: error, authored: 'platform' });
    }
  }

  async function save() {
    if (!holding) return;
    setBusy('save');
    setFailure(null);
    try {
      const response = await fetch(ENTRY_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({
          action: holding.callId === '' ? 'typed' : 'confirm',
          photoId: holding.photoId,
          callId: holding.callId,
          slot: holding.slot,
          unresolved: holding.unresolved,
          items: holding.items,
        }),
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
      router.push(`/eat/entry/${answer.entry.id}`);
      router.refresh();
    } catch (error) {
      setFailure({ title: strings.meals.unavailableTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(null);
    }
  }

  /**
   * A weighed line, which stops being an estimate.
   *
   * Recomputed on the server when the entry is saved. What changes here is the
   * claim: both ends of the band become the number he weighed and the row says
   * "weighed" instead of a range, which is the research's own rule that
   * evidence narrows a band and a weight closes it.
   */
  function applyWeight(aliasId: string) {
    const grams = Number(weight);
    if (!holding || !Number.isFinite(grams) || grams <= 0) return;
    const next: Item[] = holding.items.map((item) =>
      item.aliasId === aliasId
        ? { ...item, gramsLow: grams, gramsHigh: grams, exactGrams: grams, evidence: 'weighed' as const }
        : item,
    );
    setHolding({ ...holding, items: next });
    void refreshTotals(next);
    setWeighing(null);
    setWeight('');
  }

  function removeItem(aliasId: string) {
    if (!holding) return;
    const next = holding.items.filter((item) => item.aliasId !== aliasId);
    setHolding({ ...holding, items: next });
    void refreshTotals(next);
  }

  function addItem() {
    const grams = Number(newGrams);
    if (!holding || newAlias === '' || !Number.isFinite(grams) || grams <= 0) return;
    // Named by the owner off a list, so it carries the narrower band the
    // research gives a named portion rather than the photograph's.
    const band = { low: 0.85, high: 1.15 };
    const next: Item[] = [
      ...holding.items,
      {
        aliasId: newAlias,
        name: aliasNameById(newAlias),
        gramsLow: Math.round((grams * band.low) / 10) * 10,
        gramsHigh: Math.round((grams * band.high) / 10) * 10,
        exactGrams: null,
        evidence: 'named_portion' as const,
      },
    ];
    setHolding({ ...holding, items: next });
    void refreshTotals(next);
    setAdding(false);
    setNewAlias('');
    setNewGrams('');
  }

  if (!consented) {
    return (
      <div className="card error" role="alert" data-state="error" data-consent="off">
        <div className="between">
          <span className="lbl">{strings.meals.categories.photo_analysis}</span>
          <span className="chip a">
            <WarnIcon />
            {strings.meals.categoryOff}
          </span>
        </div>
        <div className="head">{strings.meals.consentRefusedTitle}</div>
        <p className="sub">{strings.meals.consentRefusedBody}</p>
        <div className="actions">
          <Link className="btn primary block" href="/settings/ai">
            {strings.meals.consentScreenTitle}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div data-meal-estimate={holding ? 'estimate' : 'consent'}>
      {holding === null ? (
        <>
          <section className="card" data-card="leaves">
            <div className="between" style={{ marginBottom: 'var(--s2)' }}>
              <span className="lbl">{strings.meals.leaves}</span>
              <ShieldIcon className="good" />
            </div>
            <div className="row">
              <span className="grow">{strings.meals.sends.photo}</span>
              <span className="sub num">{strings.meals.sendDetail.photo(LONG_EDGE_PX)}</span>
            </div>
            <div className="row">
              <span className="grow">{strings.meals.sends.mealContext}</span>
              <span className="sub">{strings.meals.sendDetail.mealContext}</span>
            </div>
            <div className="row">
              <span className="grow">{strings.meals.sends.question}</span>
              <span className="sub">{strings.meals.sendDetail.question}</span>
            </div>
          </section>

          <section className="card" data-card="stays">
            <span className="lbl">{strings.meals.stays}</span>
            {(['identity', 'labResults', 'location', 'credentials'] as const).map((key) => (
              <div className="row" key={key}>
                <span className="grow mut">{strings.meals.neverSent[key]}</span>
                <span className="sub">{strings.meals.neverSentDetail}</span>
              </div>
            ))}
          </section>

          <section className="card" data-card="cost">
            <div className="row">
              <span className="grow sub mut">{strings.meals.goesTo}</span>
              <span className="num">{strings.meals.goesToValue}</span>
            </div>
            <div className="row">
              <span className="grow sub mut">{strings.meals.sentFrom}</span>
              <span className="num">{strings.meals.sentFromValue}</span>
            </div>
            <div className="row">
              <span className="grow sub mut">{strings.meals.callCost}</span>
              <span className="num">{costLine}</span>
            </div>
            <div className="row">
              <span className="grow sub mut">{strings.meals.monthToDate}</span>
              <span className="num">{monthLine}</span>
            </div>
          </section>

          <div className="photo" data-photo={prepared ? 'ready' : 'empty'}>
            {prepared ? (
              <>
                {/* The bytes that will be sent, drawn from the same blob, so
                    what is on screen is what leaves. eslint-disable-next-line
                    matches the precedent in MovementMedia.tsx: a blob URL has
                    no loader and next/image cannot optimise it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={strings.meals.photoTitle} src={URL.createObjectURL(prepared.blob)} />
                <span className="tagline num">
                  {strings.meals.photoReady(prepared.width, prepared.height, prepared.kilobytes)}
                </span>
              </>
            ) : (
              <span className="ph">
                <CameraIcon />
                {strings.meals.photoTitle}
              </span>
            )}
          </div>
          <p className="note" style={{ margin: 'var(--s2) 0 var(--s3)' }}>
            {strings.meals.photoBody}
          </p>

          <label className="filefield" htmlFor="meal-photo">
            <span className="lbl">{strings.meals.choosePhoto}</span>
            <input
              id="meal-photo"
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void prepare(file);
              }}
            />
          </label>

          <button
            type="button"
            className="btn primary block"
            style={{ marginTop: 'var(--s3)' }}
            disabled={prepared === null || busy !== null}
            data-action="send"
            onClick={() => void send()}
          >
            {busy === 'send' ? strings.meals.loadingLabel : strings.meals.sendIt}
          </button>
          <button
            type="button"
            className="btn block"
            style={{ marginTop: 'var(--s2)' }}
            data-action="type-instead"
            onClick={() => {
              /*
               * The path that needs no model, no key and no network beyond this
               * machine. F99's other half: when Claude is unreachable, the meal
               * can still be logged and the whole Eat tab keeps working.
               */
              setTyping(true);
              setAdding(true);
              setHolding({
                photoId: '',
                callId: '',
                mode: 'demo',
                model: '',
                slot,
                note: '',
                unresolved: 0,
                items: [],
                totals: {
                  low: EMPTY,
                  high: EMPTY,
                  mid: EMPTY,
                  coveragePct: 0,
                  unresolvedCount: 0,
                  estimated: false,
                },
                costUsd: 0,
              });
            }}
          >
            {strings.meals.typeInstead}
          </button>
        </>
      ) : (
        <>
          {typing ? null : (
            <div className="between" style={{ marginBottom: 'var(--s3)' }}>
              <span className="src est">
                <SparkIcon />
                {holding.mode === 'demo' ? strings.meals.demoChip : strings.meals.estimateChip}
              </span>
              <span className="note num">{holding.model}</span>
            </div>
          )}

          {typing ? null : (
            <div className="banner" data-card="saw">
              <SparkIcon />
              <p className="grow">
                {items.length === 0
                  ? strings.meals.sawNothing
                  : strings.meals.saw(items.map((item) => item.name ?? item.aliasId))}{' '}
                {strings.meals.rangeNote}
              </p>
            </div>
          )}

          <section className="card" data-card="items">
            {items.map((item) => (
              <div className="row" key={item.aliasId} data-item={item.aliasId}>
                <span className="stack grow">
                  <span className="head">{item.name ?? item.aliasId}</span>
                  <span className="note num" data-portion={item.evidence}>
                    {item.exactGrams === null
                      ? strings.meals.grams(item.gramsLow, item.gramsHigh)
                      : strings.meals.gramsExact(item.exactGrams)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn icon"
                  aria-label={strings.meals.editPortion(item.name ?? item.aliasId)}
                  onClick={() => {
                    setWeighing(item.aliasId);
                    setWeight('');
                  }}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="btn icon"
                  aria-label={strings.meals.removeItem(item.name ?? item.aliasId)}
                  onClick={() => removeItem(item.aliasId)}
                >
                  <CloseIcon />
                </button>
              </div>
            ))}

            {weighing ? (
              <div className="field-block" data-weighing={weighing}>
                <label className="formfield" htmlFor="weigh-grams">
                  <span className="lbl">
                    {strings.meals.weighLabel(aliasNameById(weighing) ?? weighing)}
                  </span>
                  <input
                    id="weigh-grams"
                    className="input num"
                    inputMode="numeric"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                  />
                </label>
                <button type="button" className="btn block" onClick={() => applyWeight(weighing)}>
                  {strings.meals.weighSave}
                </button>
              </div>
            ) : null}

            {adding ? (
              <div className="field-block" data-adding="true">
                <label className="formfield" htmlFor="add-alias">
                  <span className="lbl">{strings.meals.addItemLabel}</span>
                  <select
                    id="add-alias"
                    className="input"
                    value={newAlias}
                    onChange={(event) => setNewAlias(event.target.value)}
                  >
                    <option value="" />
                    {allAliases().map((alias) => (
                      <option key={alias.id} value={alias.id}>
                        {aliasNameById(alias.id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="formfield" htmlFor="add-grams">
                  <span className="lbl">{strings.meals.addGramsLabel}</span>
                  <input
                    id="add-grams"
                    className="input num"
                    inputMode="numeric"
                    value={newGrams}
                    onChange={(event) => setNewGrams(event.target.value)}
                  />
                </label>
                <button type="button" className="btn block" onClick={addItem}>
                  {strings.meals.addItem}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn block"
                style={{ marginTop: 'var(--s3)' }}
                onClick={() => setAdding(true)}
              >
                <PlusIcon />
                {strings.meals.addMissed}
              </button>
            )}
          </section>

          {holding.unresolved > 0 ? (
            <p className="note" data-unresolved={holding.unresolved}>
              {strings.meals.unresolved(holding.unresolved)}
            </p>
          ) : null}

          <section className="card" data-card="totals">
            <div className="between">
              <span className="lbl">{strings.meals.totals}</span>
              <span className="src est">
                <SparkIcon />
                {strings.meals.estimateChip}
              </span>
            </div>
            <div className="metric num" data-total="range">
              {strings.meals.totalsRange(
                String(totals?.low.kcal ?? 0),
                String(totals?.high.kcal ?? 0),
                strings.units.kcal,
              )}
            </div>
            <MacroLine macros={totals?.mid ?? { kcal: null, proteinG: null, carbG: null, fatG: null, fibreG: null }} />
            <p className="note" style={{ marginTop: 'var(--s2)' }}>
              {strings.meals.saveNote(String(totals?.mid.kcal ?? 0))}
            </p>
          </section>

          <section className="card flat empty" data-card="not-a-fact">
            <span className="lbl">{strings.meals.notAFactTitle}</span>
            <p className="sub">{strings.meals.notAFactBody}</p>
            <p className="note" style={{ marginTop: 'var(--s2)' }}>
              {strings.meals.nothingStoredYet}
            </p>
          </section>

          <div className="stickybar">
            <button
              type="button"
              className="btn primary block"
              disabled={busy !== null || items.length === 0}
              data-action="save"
              onClick={() => void save()}
            >
              {strings.meals.saveEntry(String(totals?.mid.kcal ?? 0))}
            </button>
            <button
              type="button"
              className="btn block"
              style={{ marginTop: 'var(--s2)' }}
              data-action="discard"
              onClick={() => {
                setHolding(null);
                setPrepared(null);
                if (fileInput.current) fileInput.current.value = '';
              }}
            >
              {strings.meals.discard}
            </button>
          </div>
        </>
      )}

      {failure ? (
        <div className="card error" role="alert" data-state="error">
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
          <p className="sub" style={{ marginTop: 'var(--s2)' }}>
            {strings.meals.errorBodyRest}
          </p>
        </div>
      ) : null}
    </div>
  );
}
