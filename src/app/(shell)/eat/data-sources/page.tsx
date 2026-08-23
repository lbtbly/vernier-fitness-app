import Link from 'next/link';
import { ScreenTitle } from '@/components/ScreenTitle';
import { readFoodTableFacts } from '@/db/foods';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
export const metadata = { title: strings.nutrition.dataSourcesTitle };

/**
 * Where every number on the Eat screens comes from.
 *
 * TWO OBLIGATIONS AND ONE HABIT. Licence Ouverte 2.0 obliges paternite: name
 * the publisher and the date of the last update, and do not suggest the reuse
 * is endorsed. Both are here, in full, and so is the sentence saying this app is
 * not affiliated with Anses. The USDA line is courtesy rather than obligation
 * and is here anyway.
 *
 * EVERY NUMBER ON THIS SCREEN IS COUNTED OFF THE TABLE. F78 asks for a row
 * count and a food with a null fibre value, and a screen that stated a
 * hard-coded count would keep stating it after a seed failed halfway. The two
 * example rows are ids chosen by query, so they follow the data rather than
 * naming a fixture, and when the table has no such row the screen says so
 * instead of linking to nothing.
 */
export default async function DataSourcesPage() {
  const facts = await readFoodTableFacts();

  if (facts.total === 0) {
    return (
      <>
        <ScreenTitle
          label={strings.tabs.eat}
          title={strings.nutrition.dataSourcesTitle}
          sub={strings.nutrition.dataSourcesSub}
        />
        <div className="card empty" data-state="empty">
          <span className="lbl">{strings.nutrition.rowsLabel}</span>
          <div className="head">{strings.nutrition.dataSourcesEmptyTitle}</div>
          <p className="sub">{strings.nutrition.dataSourcesEmptyBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/eat">
              {strings.tabs.eat}
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenTitle
        label={strings.tabs.eat}
        title={strings.nutrition.dataSourcesTitle}
        sub={strings.nutrition.dataSourcesSub}
      />

      <section className="card" data-card="ciqual">
        <span className="lbl">{strings.nutrition.ciqualTable}</span>
        <dl style={{ marginTop: 'var(--s2)' }}>
          <div className="field">
            <dt>{strings.nutrition.publisherLabel}</dt>
            <dd data-publisher="true">{strings.nutrition.ciqualPublisher}</dd>
          </div>
          <div className="field">
            <dt>{strings.nutrition.tableVersionLabel}</dt>
            <dd className="num" data-table-version="true">
              {facts.tableVersion ?? strings.nutrition.unknown}
            </dd>
          </div>
          <div className="field">
            <dt>{strings.nutrition.lastUpdatedLabel}</dt>
            <dd>{strings.nutrition.ciqualLastUpdated}</dd>
          </div>
          <div className="field">
            <dt>{strings.nutrition.licenceLabel}</dt>
            <dd>{strings.nutrition.ciqualLicence}</dd>
          </div>
          <div className="field">
            <dt>{strings.nutrition.rowsLabel}</dt>
            <dd className="num" data-food-rows={facts.total}>
              {new Intl.NumberFormat('en-GB').format(facts.total)}
            </dd>
          </div>
        </dl>
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.nutrition.ciqualNotEndorsed}
        </p>
        <div className="actions">
          <a className="btn quiet" href="https://ciqual.anses.fr" rel="noreferrer noopener" target="_blank">
            {strings.nutrition.ciqualLink}
          </a>
        </div>
      </section>

      <section className="card" data-card="energy-sources">
        <span className="lbl">{strings.nutrition.energySourceLabel}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }} data-energy-counts="true">
          {strings.nutrition.energySourceCounts(facts.published, facts.computed, facts.noEnergy)}
        </p>
        <p className="sub" style={{ marginTop: 'var(--s2)' }} data-null-fibre={facts.nullFibre}>
          {strings.nutrition.nullFibreCount(facts.nullFibre)}
        </p>
        <div className="actions">
          {facts.nullFibreExample ? (
            <Link
              className="btn"
              href={`/eat/food/${encodeURIComponent(facts.nullFibreExample)}`}
              data-example="null-fibre"
            >
              {strings.nutrition.foodNoFibreExample}
            </Link>
          ) : (
            <span className="note">{strings.nutrition.foodExampleNone}</span>
          )}
          {facts.computedExample ? (
            <Link
              className="btn"
              href={`/eat/food/${encodeURIComponent(facts.computedExample)}`}
              data-example="computed-energy"
            >
              {strings.nutrition.foodComputedExample}
            </Link>
          ) : (
            <span className="note">{strings.nutrition.foodExampleNone}</span>
          )}
          {/*
            * Both sides of F79's comparison, reachable from the screen that
            * counts them. The marker is only a marker if the screen next door
            * wears a different one, and the only way to see that is to open
            * both along the route the product offers.
            */}
          {facts.publishedExample ? (
            <Link
              className="btn"
              href={`/eat/food/${encodeURIComponent(facts.publishedExample)}`}
              data-example="published-energy"
            >
              {strings.nutrition.foodPublishedExample}
            </Link>
          ) : (
            <span className="note">{strings.nutrition.foodExampleNone}</span>
          )}
        </div>
      </section>

      <section className="card" data-card="portions">
        <span className="lbl">{strings.nutrition.portionLicence}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.nutrition.portionPublisher}
        </p>
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.nutrition.portionUse}
        </p>
      </section>

      <section className="card" data-card="disclaimer">
        <p className="sub">{strings.nutrition.estimatesDisclaimer}</p>
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.nutrition.rawWeightNote}
        </p>
      </section>

      <p className="note centre" style={{ paddingBottom: 'var(--s5)' }}>
        <Link href="/eat">{strings.tabs.eat}</Link>
      </p>
    </>
  );
}
