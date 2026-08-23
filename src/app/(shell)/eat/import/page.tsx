import Link from 'next/link';
import { OfflineBanner } from '@/components/Queue';
import { RecipeImport } from '@/components/RecipeImport';
import { ScreenTitle } from '@/components/ScreenTitle';
import { readCsrfToken } from '@/lib/csrf';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
export const metadata = { title: strings.meals.boxImportTitle };

/**
 * One recipe, out of one artifact the owner already holds.
 *
 * The screen says what the product does and, more usefully, what it does not:
 * there is nothing here to sign in to, nothing scheduled, and no request to any
 * provider from any part of this build. `docs/product.md` records the terms
 * position with the date each page was consulted, and R3 grades it.
 */
export default async function RecipeImportPage() {
  const csrfToken = await readCsrfToken();

  return (
    <>
      <ScreenTitle
        label={strings.meals.boxTitle}
        title={strings.meals.boxImportTitle}
        sub={strings.meals.boxImportSub}
      />
      <OfflineBanner />
      <RecipeImport csrfToken={csrfToken} />
      <div className="card flat empty" style={{ marginTop: 'var(--s4)' }}>
        <span className="lbl">{strings.meals.boxTitle}</span>
        <p className="sub">{strings.meals.boxEmptyBody}</p>
      </div>
      <p className="note centre" style={{ padding: 'var(--s3) 0 var(--s5)' }}>
        <Link href="/eat">{strings.tabs.eat}</Link>
      </p>
    </>
  );
}
