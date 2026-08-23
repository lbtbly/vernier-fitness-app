import Link from 'next/link';
import { MealEstimate } from '@/components/MealEstimate';
import { OfflineBanner } from '@/components/Queue';
import { ScreenTitle } from '@/components/ScreenTitle';
import { monthToDateUsd, readConsent } from '@/db/ai';
import { usdText } from '@/lib/ai/cost';
import { monthKey, ratesArePresent, readAiSettings } from '@/lib/ai/mode';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { longDate } from '@/lib/format';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
export const metadata = { title: strings.meals.consentTitle };

/**
 * Screen 09, and the screen the whole slice is about.
 *
 * FIVE STATES, ONE PATTERN. The skeleton in loading.tsx at this screen's own
 * geometry, the consent card as the empty state before a photograph exists, the
 * error card inside the component with the cause in words, the offline line
 * under the title with the queue count, and the stale state on the saved entry
 * next door, where an estimate can actually be old.
 *
 * THE COST IS ON THE SCREEN BEFORE THE SEND, WHICH IS WHERE IT BELONGS. The
 * wireframe draws "This call costs about" and "This month" on the consent card,
 * and both are read here off the ledger rather than guessed: with no rate table
 * configured the line says so rather than printing a confident zero.
 */
export default async function MealEstimatePage() {
  const { timeZone } = getConfig();
  const [csrfToken, consent] = await Promise.all([readCsrfToken(), readConsent()]);
  const settings = readAiSettings();
  const month = monthKey(new Date(), timeZone);
  const spent = await monthToDateUsd(month);

  /*
   * What one call costs, as an order of magnitude rather than a promise.
   *
   * A photograph at 1092 px plus this prompt is a known number of input tokens
   * only after the count endpoint has answered, which happens after Send. What
   * can honestly be shown before it is the rate table and the month, so that is
   * what is shown: with rates configured, the ceiling arithmetic is quoted;
   * with none, the line says it is not priced yet.
   */
  const priced = ratesArePresent(settings);
  const costLine = priced
    ? usdText(
        ((settings.rates.inputPerMTok ?? 0) * 1600 + (settings.rates.outputPerMTok ?? 0) * 250) /
          1_000_000,
        4,
      )
    : strings.meals.costUnknown;

  return (
    <>
      <ScreenTitle
        label={longDate(new Date(), timeZone)}
        title={strings.meals.consentTitle}
        sub={strings.meals.consentScreenSub}
      />
      <OfflineBanner />
      <MealEstimate
        csrfToken={csrfToken}
        consented={consent.photo_analysis}
        slot="lunch"
        costLine={costLine}
        monthLine={strings.meals.monthOf(usdText(spent), usdText(settings.monthlyCapUsd))}
      />
      <p className="note centre" style={{ padding: 'var(--s3) 0 var(--s5)' }}>
        <Link href="/settings/ai">{strings.meals.consentScreenTitle}</Link>
      </p>
    </>
  );
}
