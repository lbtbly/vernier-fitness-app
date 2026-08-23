import { redirect } from 'next/navigation';
import { DeviceReport } from '@/components/DeviceReport';
import { PrecacheDemonstrations } from '@/components/PrecacheDemonstrations';
import { TabBar } from '@/components/TabBar';
import { readCsrfToken } from '@/lib/csrf';
import { mintLaunchTicket } from '@/lib/launch-ticket';
import { readSession } from '@/lib/session';

/**
 * The five tabs live behind the gate. One check here covers every screen under
 * it, and the middleware has already turned away anyone with no cookie at all;
 * this is where a cookie that names no live session is refused.
 *
 * AND IT IS WHERE THE LAUNCH REPORT IS RAISED, FOR THE SAME REASON. The report
 * used to go up from the root layout, so every document raised one, /sign-in
 * included, and the row C2 reads back as proof the owner opened Vernier from
 * his Home Screen was writable by anything that could reach the port: the
 * verifier set both signals with four lines of curl, no browser and no session,
 * using an anti-forgery pair minted by one unauthenticated GET of that very
 * screen. The write needs the owner's session now, so the report belongs where
 * the session has already been proven live rather than where a cookie has been
 * seen. The ticket is minted from this session's id, which is what the route
 * checks it against, and a page rendered for a stale cookie carries none.
 *
 * The owner does nothing extra for this. A Home Screen launch opens the start
 * URL, which is a screen under here, and the report goes up with the page. A
 * launch that finds the session expired lands on the gate, which reports
 * nothing, and the sign-in that follows loads this layout with a full document
 * navigation, which does.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect('/sign-in');
  const csrfToken = await readCsrfToken();

  return (
    <div className="app">
      <main className="app-scroll">{children}</main>
      <TabBar />
      <DeviceReport csrfToken={csrfToken} launchTicket={mintLaunchTicket(session.id)} />
      {/*
        F66. The demonstrations are precached at install, and an install that
        ran on the sign-in screen could cache none of them, because /movements
        is behind this very gate. Asked from here, where the session is already
        proven live, for the same reason the launch report is.
      */}
      <PrecacheDemonstrations />
    </div>
  );
}
