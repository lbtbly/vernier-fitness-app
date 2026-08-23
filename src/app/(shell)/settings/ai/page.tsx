import Link from 'next/link';
import { ConsentSwitches } from '@/components/ConsentSwitches';
import { ScreenTitle } from '@/components/ScreenTitle';
import { monthToDateUsd, readConsent, readLedger } from '@/db/ai';
import { usdText } from '@/lib/ai/cost';
import { monthKey, ratesArePresent, readAiSettings } from '@/lib/ai/mode';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { shortDateTime } from '@/lib/format';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
export const metadata = { title: strings.meals.consentScreenTitle };

/**
 * The four switches, the mode, the ceiling and every call this month.
 *
 * The operator surface for the only metered cost in this build. It answers the
 * three questions an owner actually has: what may leave, what has left, and
 * what it cost. The ledger below is read straight out of `usage_ledger`,
 * refusals included, because a month in which the ceiling stopped six calls has
 * to look different from a month in which nobody tried.
 */
export default async function AiConsentPage() {
  const { timeZone } = getConfig();
  const [consent, csrfToken] = await Promise.all([readConsent(), readCsrfToken()]);
  const settings = readAiSettings();
  const month = monthKey(new Date(), timeZone);
  const [spent, ledger] = await Promise.all([monthToDateUsd(month), readLedger(month)]);

  return (
    <>
      <ScreenTitle
        label={strings.settings.title}
        title={strings.meals.consentScreenTitle}
        sub={strings.meals.consentScreenSub}
      />

      <ConsentSwitches initial={consent} csrfToken={csrfToken} />

      <section className="card" data-card="ai-mode">
        <div className="row">
          <span className="grow sub mut">{strings.meals.modeLabel}</span>
          <span className="num">
            {settings.mode === 'demo' ? strings.meals.modeDemo : strings.meals.modeLive}
          </span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.meals.modelLabel}</span>
          <span className="num">{settings.model === '' ? strings.meals.modelUnvalidated : settings.model}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.meals.capLabel}</span>
          <span className="num">{usdText(settings.monthlyCapUsd)}</span>
        </div>
        <div className="row">
          <span className="grow sub mut">{strings.meals.spentLabel}</span>
          <span className="num">{strings.meals.monthOf(usdText(spent), usdText(settings.monthlyCapUsd))}</span>
        </div>
        {ratesArePresent(settings) ? null : (
          <p className="note warn" style={{ marginTop: 'var(--s2)' }} data-state="no-rates">
            {strings.meals.noRatesBody}
          </p>
        )}
      </section>

      <span className="lbl" style={{ margin: 'var(--s4) 0 var(--s2)' }}>
        {strings.meals.ledgerTitle}
      </span>
      {ledger.length === 0 ? (
        <div className="card tight" data-state="empty">
          <p className="sub">{strings.meals.ledgerEmpty}</p>
        </div>
      ) : (
        <section className="card" data-card="ledger">
          {ledger.map((row) => (
            <div className="row" key={row.id} data-outcome={row.outcome}>
              <div className="stack grow">
                <span>{strings.meals.categories[row.purpose as 'photo_analysis']}</span>
                <span className="note num">
                  {strings.meals.ledgerTokens(row.inputTokens, row.outputTokens)}
                  {' · '}
                  {shortDateTime(row.createdAt, timeZone)}
                </span>
              </div>
              <span className="num">
                {row.outcome === 'refused_over_ceiling'
                  ? strings.meals.ledgerRefused
                  : usdText(row.costUsd, 4)}
              </span>
            </div>
          ))}
        </section>
      )}

      <p className="note centre" style={{ padding: 'var(--s3) 0 var(--s5)' }}>
        <Link href="/eat/estimate">{strings.meals.photographMeal}</Link>
      </p>
    </>
  );
}
