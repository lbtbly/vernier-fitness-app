import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/SignInForm';
import { countOwners } from '@/db/auth';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { readSession } from '@/lib/session';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.signIn.title };
export const dynamic = 'force-dynamic';

/**
 * Sign-in sits outside the tabs. An unauthenticated visitor on the tailnet
 * reaches this page, the liveness endpoint, the offline document, the two
 * diagnostics reports and the static shell, and nothing else.
 *
 * F7 reads the origin and the relying party off this page. Both come from
 * APP_URL and WEBAUTHN_RP_ID on every request, so changing them and restarting
 * the stack changes what this page reports with no source file touched.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const config = getConfig();

  // Already signed in: the gate has nothing to ask.
  const session = await readSession().catch(() => null);
  if (session) redirect('/');

  // A database that is not answering is a machine that is not answering, and
  // the screen says so rather than rendering a first-run form it cannot honour.
  let ownerExists = false;
  let databaseReachable = true;
  try {
    ownerExists = (await countOwners()) > 0;
  } catch {
    databaseReachable = false;
    ownerExists = true;
  }

  const params = await searchParams;
  const requested = typeof params.next === 'string' ? params.next : '/';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';

  return (
    <SignInForm
      originHost={config.originHost}
      appUrl={config.appUrl}
      rpId={config.rpId}
      rpName={config.rpName}
      ownerExists={ownerExists}
      csrfToken={await readCsrfToken()}
      next={next}
      databaseReachable={databaseReachable}
    />
  );
}
