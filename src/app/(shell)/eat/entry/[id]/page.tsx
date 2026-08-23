import Link from 'next/link';
import { EntryCorrection } from '@/components/EntryCorrection';
import { MacroLine } from '@/components/Macros';
import { SourceChip } from '@/components/SourceChip';
import { DocIcon, WarnIcon } from '@/components/icons';
import { readCall } from '@/db/ai';
import { readEntry, readEntryChain, readEntryItems } from '@/db/meals';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { aliasNameById } from '@/lib/food-aliases';
import { daysBetween, longDate, shortDateTime, time24 } from '@/lib/format';
import { energyText } from '@/lib/macros';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
export const metadata = { title: strings.meals.entryTitle };

/** How old an estimate has to be before this screen says so. */
const STALE_AFTER_DAYS = 7;

/**
 * Screen 09 frame 3, and tap 1 of the walk F97 measures.
 *
 * TAP 1 IS THIS SCREEN. It carries the stored energy, the range it came out of,
 * the origin, the model, the photograph and the whole correction history with
 * the original struck through. TAP 2 is the one button at the bottom, which
 * lands on the source record, where the photograph is drawn and the model's own
 * reply is read back. Two taps, from the row on the Eat screen to the words the
 * model actually sent, after any number of edits.
 *
 * THE BADGE IS READ OFF THE ROW AND NOT OFF A PROP. `confidence` comes from the
 * row that stands in the chain today, so an entry corrected three times is
 * drawn from the third correction's own columns, and the database is what
 * guarantees those columns still say estimate.
 */
export default async function MealEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { timeZone } = getConfig();
  const row = await readEntry(id);

  if (!row) {
    return (
      <>
        <header className="title">
          <h1>{strings.meals.entryNotFound}</h1>
        </header>
        <div className="card empty">
          <p className="sub">{strings.meals.entryNotFoundBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/eat">
              {strings.tabs.eat}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const [chain, items, csrfToken] = await Promise.all([
    readEntryChain(row.rootId),
    readEntryItems(row.id),
    readCsrfToken(),
  ]);
  const current = chain.at(-1) ?? row;
  const original = chain[0];
  const call = current.aiCallId ? await readCall(current.aiCallId) : undefined;
  const estimated = current.confidence === 'estimated';
  const ageDays = daysBetween(current.createdAt, new Date(), timeZone);
  const stale = ageDays >= STALE_AFTER_DAYS;

  const macros = {
    kcal: current.kcal,
    proteinG: current.proteinG,
    carbG: current.carbG,
    fatG: current.fatG,
    fibreG: current.fibreG,
  };

  return (
    <>
      <header className="title">
        <span className="lbl">
          {strings.nutrition.slots[current.slot as 'breakfast' | 'lunch' | 'dinner' | 'snack']}
        </span>
        <h1>{strings.meals.entryTitle}</h1>
        <p className="sub num">
          {current.eatenAt
            ? strings.meals.entryLine([
                longDate(current.eatenAt, timeZone),
                time24(current.eatenAt, timeZone),
              ])
            : strings.meals.secondPortionAnswers.frozen}
        </p>
      </header>

      {stale ? (
        <div className="banner w" data-state="stale">
          <WarnIcon />
          <div className="grow">
            <p>
              <b>{strings.meals.staleTitle(ageDays)}</b>
            </p>
            <p className="note warn">{strings.meals.staleBody}</p>
          </div>
        </div>
      ) : null}

      <section className="card" data-card="entry">
        <div className="between">
          <span className="metric num" data-entry-kcal="true">
            {energyText(macros.kcal, estimated ? 'estimated' : 'computed')}{' '}
            <span className="sub">{strings.units.kcal}</span>
          </span>
          <SourceChip source={current.source} confidence={current.confidence} />
        </div>
        {current.kcalLow !== null && current.kcalHigh !== null ? (
          <p className="sub num" data-entry-range="true">
            {strings.meals.entryRange(String(current.kcalLow), String(current.kcalHigh))}
          </p>
        ) : null}
        <div style={{ marginTop: 'var(--s2)' }}>
          <MacroLine macros={macros} />
        </div>
        {estimated ? (
          <p className="note" style={{ marginTop: 'var(--s2)' }} data-still-estimate="true">
            {strings.meals.stillAnEstimate}
          </p>
        ) : null}
      </section>

      <section className="card" data-card="items">
        <span className="lbl">{strings.nutrition.ingredients}</span>
        {items.map((item) => (
          <div className="row" key={item.id}>
            <span className="grow">{aliasNameById(item.aliasId) ?? item.aliasId}</span>
            <span className="sub num">
              {item.exactGrams === null
                ? strings.meals.grams(Math.round(item.gramsLow), Math.round(item.gramsHigh))
                : strings.meals.gramsExact(Math.round(item.exactGrams))}
            </span>
          </div>
        ))}
        {current.unresolvedCount > 0 ? (
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.meals.unresolved(current.unresolvedCount)}
          </p>
        ) : null}
      </section>

      <section className="card" data-card="origin">
        <div className="between" style={{ marginBottom: 'var(--s2)' }}>
          <span className="lbl">{strings.meals.entryOrigin}</span>
          <SourceChip source={current.source} confidence={current.confidence} />
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.meals.entryOrigin}</span>
          <span className="num">
            {
              strings.meals.entryOrigins[
                current.origin as 'photo_estimate' | 'typed' | 'recipe_box' | 'planned'
              ]
            }
          </span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.meals.entryEstimatedAt}</span>
          <span className="num">{shortDateTime(original.createdAt, timeZone)}</span>
        </div>
        {call ? (
          <div className="row">
            <span className="grow sub mut">{strings.meals.entryModel}</span>
            <span className="num">{call.model}</span>
          </div>
        ) : null}
        {current.photoId ? (
          <div className="row">
            <span className="grow sub mut">{strings.meals.entryPhoto}</span>
            <span className="num">{strings.meals.entryPhotoKept}</span>
          </div>
        ) : null}
        {chain.length > 1 ? (
          <div className="row">
            <span className="grow sub mut">{strings.meals.entryCorrected}</span>
            <span className="num">{current.correctionReason ?? ''}</span>
          </div>
        ) : null}
      </section>

      <span className="lbl" style={{ margin: 'var(--s4) 0 var(--s2)' }}>
        {strings.meals.correctionHistory}
      </span>

      {chain.length === 1 ? (
        <div className="card tight">
          <p className="sub">{strings.meals.noCorrection}</p>
        </div>
      ) : (
        chain.slice(1).map((entry, index) => {
          const previous = chain[index];
          return (
            <div className="card tight" key={entry.id} data-correction={entry.correctionIndex}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <div className="stack grow">
                  <span className="sub num">
                    {strings.meals.correctionRow(
                      energyText(previous.kcal, 'estimated'),
                      energyText(entry.kcal, 'estimated'),
                    )}
                  </span>
                  <span className="note">
                    {strings.meals.correctionBy(
                      shortDateTime(entry.createdAt, timeZone),
                      entry.correctionReason ?? '',
                    )}
                  </span>
                </div>
                <span className="chip">{strings.provenance.appendOnly}</span>
              </div>
            </div>
          );
        })
      )}

      {chain.length > 1 ? (
        <div className="card tight">
          <div className="between">
            <span className="sub mut">{strings.provenance.original}</span>
            <span className="num was">
              <s>
                {energyText(original.kcal, 'estimated')} {strings.units.kcal}
              </s>
            </span>
          </div>
        </div>
      ) : null}

      <EntryCorrection
        entryId={current.id}
        currentKcal={String(Math.round(current.kcal ?? 0))}
        csrfToken={csrfToken}
      />

      {/*
        * Tap 2. The same destination shape every other source uses, and on a
        * photo estimate it draws the photograph and reads back the model's own
        * reply. Two taps from the day card, however many corrections later.
        */}
      <Link className="btn primary block" href={`/source/${current.sourceRecordId}`} data-tap="2">
        <DocIcon />
        {strings.meals.openPhotoAndReply}
      </Link>
      <p className="note centre" style={{ margin: 'var(--s2) 0 var(--s5)' }}>
        {strings.provenance.openSourceHint}
      </p>
    </>
  );
}
