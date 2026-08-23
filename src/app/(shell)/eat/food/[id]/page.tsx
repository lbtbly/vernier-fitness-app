import Link from 'next/link';
import { MacroLine } from '@/components/Macros';
import { ScreenTitle } from '@/components/ScreenTitle';
import { InfoIcon } from '@/components/icons';
import { readFood } from '@/db/foods';
import { energyProvenance } from '@/lib/display';
import { allAliases, aliasFoodId, aliasName } from '@/lib/food-aliases';
import { energyText } from '@/lib/macros';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
export const metadata = { title: strings.nutrition.foodTitle };

/**
 * One row of the food table, as Anses published it.
 *
 * F78'S "RENDERS AS UNKNOWN AND NEVER AS 0" HAS A SCREEN, AND THIS IS IT. The
 * data-sources screen links straight to a live row with no fibre value, chosen
 * by query rather than named in a constant, so the capture is of the product
 * telling the truth about a real food rather than of a fixture built to pass.
 *
 * F79's marker is here too, on the number it belongs to: an energy Anses
 * published and an energy Vernier computed are two different sentences on this
 * screen, and the second one names the regulation it was computed under.
 */
export default async function FoodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await readFood(decodeURIComponent(id));

  if (!row) {
    return (
      <>
        <ScreenTitle title={strings.nutrition.foodNotFound} />
        <div className="card empty">
          <span className="lbl">{strings.tabs.eat}</span>
          <div className="head">{strings.nutrition.foodNotFound}</div>
          <p className="sub">{strings.nutrition.foodNotFoundBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/eat/data-sources">
              {strings.nutrition.dataSourcesTitle}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const alias = allAliases().find((entry) => aliasFoodId(entry) === row.id) ?? null;
  const energy = energyProvenance(row.energySource);

  return (
    <>
      <ScreenTitle
        label={strings.nutrition.foodTitle}
        title={alias ? aliasName(alias) : row.nameFr}
        sub={strings.nutrition.ciqualTable}
      />

      <section className="card" data-card="per-100g">
        <span className="lbl">{strings.nutrition.foodPer100g}</span>
        <div className="between" style={{ marginTop: 'var(--s3)' }}>
          <span className="lbl">{strings.nutrition.energy}</span>
          <span className="metric" data-energy-value="true">
            {row.kcal100g === null ? (
              <span className="unknown" data-unknown="true">
                {strings.nutrition.unknown}
              </span>
            ) : (
              <>
                {energyText(row.kcal100g)} {strings.units.kcal}
              </>
            )}
          </span>
        </div>
        <div style={{ marginTop: 'var(--s3)' }}>
          <MacroLine
            macros={{
              kcal: row.kcal100g,
              proteinG: row.proteinG,
              carbG: row.carbG,
              fatG: row.fatG,
              fibreG: row.fibreG,
            }}
          />
        </div>

        {/*
          * The marker, one tap from the number, and it names which of the three
          * this food is. It used to read "Computed energy" whatever the column
          * said: a published 274 kcal and a computed one wore the same chip,
          * the same colour and the same background, and only the paragraph
          * inside the panel differed. The words, the border and the data flag
          * all come off `energy_source` now, in one place, so the chip cannot
          * drift from the sentence under it.
          */}
        <details className="card flat" style={{ marginTop: 'var(--s3)', padding: 0 }}>
          <summary
            className={energy.className}
            style={{ cursor: 'pointer', minHeight: 'var(--touch)' }}
            data-flag={energy.flag}
            data-energy-source={row.energySource ?? 'none'}
          >
            <InfoIcon />
            {energy.chip}
          </summary>
          <p className="sub" style={{ paddingTop: 'var(--s2)' }}>
            {energy.body}
          </p>
        </details>

        {row.censoredFields.length > 0 ? (
          <p className="note warn" style={{ marginTop: 'var(--s3)' }} data-censored="true">
            {strings.nutrition.foodCensoredBody(
              row.censoredFields.map((column) => strings.nutrition.censoredField(column)).join(', '),
            )}
          </p>
        ) : null}
      </section>

      <section className="card" data-card="provenance">
        <span className="lbl">{strings.nutrition.provenanceLabel}</span>
        <dl style={{ marginTop: 'var(--s2)' }}>
          <div className="field">
            <dt>{strings.nutrition.foodPublishedName}</dt>
            <dd>{row.nameFr}</dd>
          </div>
          {alias ? (
            <div className="field">
              <dt>{strings.nutrition.foodEnglishName}</dt>
              <dd>{aliasName(alias)}</dd>
            </div>
          ) : null}
          <div className="field">
            <dt>{strings.nutrition.foodGroupLabel}</dt>
            <dd className="num">{`${row.groupCode} ${row.subgroupCode}`}</dd>
          </div>
          <div className="field">
            <dt>{strings.nutrition.publisherLabel}</dt>
            <dd>{strings.nutrition.ciqualPublisher}</dd>
          </div>
          <div className="field">
            <dt>{strings.nutrition.tableVersionLabel}</dt>
            <dd className="num">{row.tableVersion}</dd>
          </div>
          <div className="field">
            <dt>{strings.nutrition.licenceLabel}</dt>
            <dd>{strings.nutrition.ciqualLicence}</dd>
          </div>
        </dl>
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.nutrition.ciqualNotEndorsed}
        </p>
      </section>

      <p className="note centre" style={{ paddingBottom: 'var(--s5)' }}>
        <Link href="/eat/data-sources">{strings.nutrition.dataSourcesFooter}</Link>
      </p>
    </>
  );
}
