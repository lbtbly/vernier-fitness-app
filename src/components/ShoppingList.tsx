'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BoxIcon, CloseIcon, HomeIcon, InfoIcon, MinusIcon, OkIcon, PlusIcon } from '@/components/icons';
import { aisleLabel, allAliases, aliasName, type Aisle } from '@/lib/food-aliases';
import { depth, enqueue, flushOutbox, startFlushTriggers, subscribe } from '@/lib/outbox';
import { quantityText } from '@/lib/shopping';
import { strings } from '@/lib/strings';

/**
 * The list, in the shop, one hand on the trolley.
 *
 * F88: the ticks survive a page reload because they are a column and not a
 * browser state, and they survive a shop with no signal because they go through
 * the same offline outbox every other write in this app uses. Apply locally,
 * enqueue, kick the flusher. There is no `if (navigator.onLine)` here and there
 * must never be one: the phone can be on cellular, report online and reach
 * nothing, which is exactly what a Tailscale origin does in a basement.
 *
 * F89: A DEDUCTED LINE DOES NOT DISAPPEAR. It keeps its place in its aisle, its
 * quantity is struck through, and the reason sits under the name: the recipe
 * box on a named day, or the cupboard with the date it was marked. A line that
 * vanishes is a line nobody can check, and seeing the deduction happen is the
 * entire value of having one.
 */

export type ItemView = {
  id: string;
  aliasId: string;
  name: string;
  aisle: Aisle;
  unit: 'g' | 'kg' | 'count';
  neededQuantity: number;
  originalQuantity: number;
  quantity: number;
  countNoun: string | null;
  deduction: 'none' | 'box' | 'stock';
  deductionLabel: string | null;
  checked: boolean;
  removed: boolean;
  step: number;
  sources: { recipeName: string; when: string; quantity: string }[];
  roundedNote: string | null;
  inStock: boolean;
};

const ENDPOINT = '/api/shopping/item';

/** A key for one write. The outbox uses it as its Idempotency-Key verbatim. */
function writeKey(): string {
  return crypto.randomUUID();
}

export function ShoppingList({
  listId,
  items,
  aisles,
  excludedSubjects,
}: {
  listId: string;
  items: ItemView[];
  aisles: Aisle[];
  /** Subjects an allergy or an exclusion covers, named on the aisle they hit. */
  excludedSubjects: string[];
}) {
  const router = useRouter();
  const [local, setLocal] = useState(items);
  const [open, setOpen] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const [addAlias, setAddAlias] = useState('');
  const [addQuantity, setAddQuantity] = useState('1');

  /*
   * The server's list, adopted when it changes.
   *
   * React's own "adjusting state when a prop changes" pattern rather than an
   * effect: an effect would render the stale list once, then the fresh one, and
   * in a shop that reads as a tick coming undone and going back. This runs
   * during the render that first sees the new array, so the screen never draws
   * the old one after a refresh.
   */
  const [adopted, setAdopted] = useState(items);
  if (adopted !== items) {
    setAdopted(items);
    setLocal(items);
  }

  useEffect(() => {
    const stop = startFlushTriggers();
    const refresh = () => {
      void depth().then(setQueued);
    };
    const unsubscribe = subscribe(refresh);
    refresh();
    return () => {
      unsubscribe();
      stop();
    };
  }, []);

  /** Apply, enqueue, kick. No branch, no probe, no spinner that waits. */
  async function write(body: Record<string, unknown>) {
    await enqueue({ id: writeKey(), url: ENDPOINT, body });
    void flushOutbox({ force: true }).then(() => router.refresh());
  }

  function toggle(item: ItemView) {
    if (item.deduction !== 'none') return;
    const checked = !item.checked;
    setLocal((rows) => rows.map((row) => (row.id === item.id ? { ...row, checked } : row)));
    void write({ id: item.id, checked });
  }

  function step(item: ItemView, direction: 1 | -1) {
    const next = Math.max(item.step, Math.round((item.quantity + direction * item.step) * 100) / 100);
    setLocal((rows) => rows.map((row) => (row.id === item.id ? { ...row, quantity: next } : row)));
    void write({ id: item.id, quantity: next });
  }

  function setInStock(item: ItemView, inStock: boolean) {
    setLocal((rows) => rows.map((row) => (row.id === item.id ? { ...row, inStock } : row)));
    void write({
      aliasId: item.aliasId,
      inStock,
      stockQuantity: inStock ? item.quantity : undefined,
    });
  }

  function remove(item: ItemView) {
    setLocal((rows) => rows.map((row) => (row.id === item.id ? { ...row, removed: true } : row)));
    setOpen(null);
    void write({ id: item.id, removed: true });
  }

  const live = local.filter((item) => !item.removed);
  const deducted = live.filter((item) => item.deduction !== 'none').length;
  const inTrolley = live.filter((item) => item.deduction === 'none' && item.checked).length;
  const toBuy = live.length - deducted - inTrolley;
  const share = (count: number) => (live.length === 0 ? 0 : (count / live.length) * 100);

  const sheetItem = open ? (live.find((item) => item.id === open) ?? null) : null;
  const onList = new Set(local.map((item) => item.aliasId));
  const addable = allAliases().filter((alias) => !onList.has(alias.id));

  return (
    <div data-shopping-list={listId}>
      {queued > 0 ? (
        <div className="banner queue" data-state="offline" data-queued={queued} aria-live="polite">
          <p className="grow queue-line">
            <b>{strings.nutrition.shoppingOfflineTitle}</b>{' '}
            {strings.nutrition.shoppingOfflineBody(queued)}
          </p>
        </div>
      ) : null}

      <section className="card pad" data-card="counts">
        <div className="between">
          <div className="stack">
            <span className="big num" data-to-buy={toBuy}>
              {strings.nutrition.toBuy(toBuy)}
            </span>
            <span className="note">{strings.nutrition.shoppingCounts(deducted, inTrolley)}</span>
          </div>
        </div>
        <div className="bars" aria-hidden="true">
          <i className="done" style={{ width: `${share(inTrolley)}%` }} />
          <i className="left" style={{ width: `${share(toBuy)}%` }} />
          <i className="cut" style={{ width: `${share(deducted)}%` }} />
        </div>
        <p className="note">{strings.nutrition.shoppingBars}</p>
      </section>

      {aisles.map((aisle) => {
        const inAisle = live.filter((item) => item.aisle === aisle);
        if (inAisle.length === 0) return null;
        return (
          <section key={aisle} data-aisle={aisle}>
            <span className="lbl daylabel">{aisleLabel(aisle)}</span>
            <div className="card">
              {inAisle.map((item) => (
                <div
                  className={item.deduction === 'none' ? 'item' : 'item off'}
                  key={item.id}
                  data-item={item.id}
                  data-deduction={item.deduction}
                >
                  {item.deduction === 'none' ? (
                    <button
                      type="button"
                      className="boxtap"
                      onClick={() => toggle(item)}
                      aria-label={
                        item.checked
                          ? strings.nutrition.untickItem(item.name)
                          : strings.nutrition.tickItem(item.name)
                      }
                    >
                      <span className="box" role="checkbox" aria-checked={item.checked} aria-hidden="true">
                        <OkIcon />
                      </span>
                    </button>
                  ) : (
                    <span className="tap" aria-hidden="true">
                      {item.deduction === 'box' ? <BoxIcon /> : <HomeIcon />}
                    </span>
                  )}
                  <button
                    type="button"
                    className="stack grow"
                    style={{ background: 'transparent', border: 0, textAlign: 'left', cursor: 'pointer' }}
                    onClick={() => setOpen(item.id)}
                    aria-label={strings.nutrition.openItem(item.name)}
                  >
                    <span
                      className="name"
                      style={item.checked ? { textDecoration: 'line-through', color: 'var(--text-3)' } : undefined}
                    >
                      {item.name}
                    </span>
                    <span className="note num">
                      {item.deduction === 'none'
                        ? strings.nutrition.itemFor(
                            quantityText(item),
                            strings.nutrition.itemMeals(item.sources.length),
                          )
                        : (item.deductionLabel ?? '')}
                    </span>
                    {item.deduction !== 'none' ? (
                      <span className="note was" data-struck="true">
                        {strings.nutrition.deductedOriginal(
                          quantityText({ ...item, quantity: item.originalQuantity }),
                        )}
                      </span>
                    ) : null}
                  </button>
                  {item.deduction === 'none' ? (
                    <div className="qty">
                      <button
                        type="button"
                        aria-label={
                          item.unit === 'count'
                            ? strings.nutrition.oneFewer(item.name)
                            : strings.nutrition.lessOf(item.name)
                        }
                        onClick={() => step(item, -1)}
                      >
                        <MinusIcon />
                      </button>
                      <span className="v num">{quantityText(item)}</span>
                      <button
                        type="button"
                        aria-label={
                          item.unit === 'count'
                            ? strings.nutrition.oneMore(item.name)
                            : strings.nutrition.moreOf(item.name)
                        }
                        onClick={() => step(item, 1)}
                      >
                        <PlusIcon />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {aisle === 'fish_meat' && excludedSubjects.length > 0 ? (
                <p className="note" style={{ padding: '4px 0 10px' }} data-exclusion-note="true">
                  {strings.nutrition.excludedNote(excludedSubjects.join(' '))}
                </p>
              ) : null}
            </div>
          </section>
        );
      })}

      <section className="card" data-card="add">
        <label className="formfield" htmlFor="add-alias">
          <span className="lbl">{strings.nutrition.addItem}</span>
          <select
            id="add-alias"
            className="input"
            value={addAlias}
            onChange={(event) => setAddAlias(event.target.value)}
          >
            <option value="">{strings.nutrition.chooseSubject}</option>
            {addable.map((alias) => (
              <option key={alias.id} value={alias.id}>
                {aliasName(alias)}
              </option>
            ))}
          </select>
        </label>
        <label className="formfield" htmlFor="add-quantity">
          <span className="lbl">{strings.nutrition.quantityLabel}</span>
          <input
            id="add-quantity"
            className="input num"
            inputMode="decimal"
            value={addQuantity}
            onChange={(event) => setAddQuantity(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn block"
          disabled={addAlias === ''}
          data-control="add-item"
          onClick={() => {
            void write({
              action: 'add',
              listId,
              aliasId: addAlias,
              quantity: Number(addQuantity.replace(',', '.')),
            });
            setAddAlias('');
          }}
        >
          <PlusIcon />
          {strings.nutrition.addItem}
        </button>
      </section>

      <p className="note centre">{strings.nutrition.shoppingClosing}</p>

      {sheetItem ? (
        <>
          <button
            type="button"
            className="scrim"
            aria-label={strings.nutrition.closeItem}
            onClick={() => setOpen(null)}
          />
          <div className="sheet" role="dialog" aria-modal="true" data-sheet={sheetItem.id}>
            <span className="grabber" />
            <div className="between sheet-head">
              <div className="stack">
                <span className="title-line">{sheetItem.name}</span>
                <span className="note">{aisleLabel(sheetItem.aisle)}</span>
              </div>
              <button
                type="button"
                className="btn icon"
                aria-label={strings.nutrition.closeItem}
                onClick={() => setOpen(null)}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="sheetbody">
              <span className="lbl">{strings.nutrition.quantityLabel}</span>
              <div className="qty" style={{ justifyContent: 'space-between', margin: 'var(--s2) 0' }}>
                <button
                  type="button"
                  style={{ width: '64px', height: '56px' }}
                  aria-label={
                    sheetItem.unit === 'count'
                      ? strings.nutrition.oneFewer(sheetItem.name)
                      : strings.nutrition.lessOf(sheetItem.name)
                  }
                  onClick={() => step(sheetItem, -1)}
                >
                  <MinusIcon />
                </button>
                <span className="v num" style={{ fontSize: '28px', fontWeight: 700 }}>
                  {quantityText(sheetItem)}
                </span>
                <button
                  type="button"
                  style={{ width: '64px', height: '56px' }}
                  aria-label={
                    sheetItem.unit === 'count'
                      ? strings.nutrition.oneMore(sheetItem.name)
                      : strings.nutrition.moreOf(sheetItem.name)
                  }
                  onClick={() => step(sheetItem, 1)}
                >
                  <PlusIcon />
                </button>
              </div>
              <p className="note">
                {sheetItem.unit === 'count'
                  ? strings.nutrition.quantityStepCountNote
                  : strings.nutrition.quantityStepNote(
                      String(sheetItem.step),
                      sheetItem.unit === 'kg' ? strings.units.kg : strings.units.g,
                    )}
              </p>

              <div className="card pad" style={{ marginTop: 'var(--s4)' }}>
                <span className="lbl">{strings.nutrition.whereFrom}</span>
                {sheetItem.sources.map((source, index) => (
                  <div className="item" key={`${source.recipeName}-${index}`} style={{ minHeight: 'var(--touch)' }}>
                    <span className="grow">
                      {strings.nutrition.fromMeal(source.recipeName, source.when, source.quantity)}
                    </span>
                  </div>
                ))}
                {sheetItem.roundedNote ? (
                  <div className="item" style={{ minHeight: 'var(--touch)' }}>
                    <div className="stack grow">
                      <span>{strings.nutrition.roundedToUnit}</span>
                      <span className="note num">{sheetItem.roundedNote}</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="card pad">
                <div className="between">
                  <div className="stack grow">
                    <span>{strings.nutrition.inStockToggle}</span>
                    <span className="note">{strings.nutrition.inStockNote}</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    className="btn icon"
                    aria-checked={sheetItem.inStock}
                    aria-label={strings.nutrition.inStockToggle}
                    data-control="in-stock"
                    onClick={() => setInStock(sheetItem, !sheetItem.inStock)}
                  >
                    {sheetItem.inStock ? <OkIcon /> : <PlusIcon />}
                  </button>
                </div>
              </div>

              <div className="banner">
                <InfoIcon />
                <p className="grow">{strings.nutrition.stockBanner}</p>
              </div>
            </div>

            <div className="sheetfoot">
              <button type="button" className="btn primary block" onClick={() => setOpen(null)}>
                {strings.nutrition.saveItem}
              </button>
              <button
                type="button"
                className="btn block"
                style={{ marginTop: 'var(--s2)' }}
                data-control="remove-item"
                onClick={() => remove(sheetItem)}
              >
                {strings.nutrition.removeItem}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
