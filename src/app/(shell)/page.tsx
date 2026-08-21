import { headers } from 'next/headers';
import { after } from 'next/server';
import { EmptyState } from '@/components/EmptyState';
import { ScreenTitle } from '@/components/ScreenTitle';
import { recordRequestOrigin } from '@/db/diagnostics';
import { getConfig } from '@/lib/config';
import { longDate } from '@/lib/format';
import { readRequestOrigin } from '@/lib/request-origin';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.today.title };

export default async function TodayPage() {
  const { timeZone } = getConfig();

  // F4 and R1 both turn on the app answering from a second device on the
  // tailnet. The visit itself is the proof, so the visit is recorded: through
  // the proxy or not, and from which tailnet address. Evidence of origin,
  // never a credential; it decides nothing on this page or on any other.
  //
  // after(), so a slow write never delays Today, and inside a try so a database
  // that is down costs a log line and not the screen.
  const { peerAddress, viaTailscale } = readRequestOrigin(await headers());
  if (peerAddress) {
    after(async () => {
      try {
        await recordRequestOrigin({ peerAddress, viaTailscale });
      } catch (error) {
        console.error(`[vernier] request origin not recorded: ${(error as Error).message}`);
      }
    });
  }

  return (
    <>
      <ScreenTitle label={longDate(new Date(), timeZone)} title={strings.today.title} />
      <EmptyState
        label={strings.tabs.today}
        title={strings.today.emptyTitle}
        body={strings.today.emptyBody}
        actionLabel={strings.common.createAccount}
        actionHref="/sign-in"
      />
    </>
  );
}
