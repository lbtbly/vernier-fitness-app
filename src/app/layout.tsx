import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { DeviceReport } from '@/components/DeviceReport';
import { ServiceWorker } from '@/components/ServiceWorker';
import { getConfig } from '@/lib/config';
import { SESSION_COOKIE } from '@/lib/cookie-names';
import { readCsrfToken } from '@/lib/csrf';
import { mintLaunchTicket } from '@/lib/launch-ticket';
import './globals.css';
import { strings } from '@/lib/strings';
import { hashSessionToken } from '@/lib/tokens';

/**
 * Every route renders per request. The origin, the relying party, the app name
 * and the time zone are configuration, and a page prerendered at build time
 * would freeze the values that F7 changes at runtime.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const config = getConfig();
  return {
    title: {
      default: config.appName,
      template: `%s · ${config.appName}`,
    },
    description: strings.manifest.documentDescription,
    applicationName: config.appName,
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      title: config.appName,
      statusBarStyle: 'black-translucent',
    },
    icons: {
      icon: [
        { url: '/icons/vernier-mark.svg', type: 'image/svg+xml' },
        { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      ],
      apple: [{ url: '/icons/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' }],
    },
    formatDetection: { telephone: false, date: false, address: false, email: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0A0A0B',
};

/**
 * Dark first, exactly as the wireframes render. The light theme block ships in
 * the stylesheet too and takes over the moment data-theme reads light.
 *
 * The launch report writes, so the token travels with it. This is a server
 * component and the middleware has already minted the value for this very
 * request, so the layout reads it here and hands it down rather than leaving a
 * mutating route with no anti-forgery on it.
 *
 * AND IT HANDS DOWN THE TICKET THAT SAYS THIS PAGE WAS SERVED. The report is
 * the only witness C2 has that the owner opened Vernier from his Home Screen,
 * and until now anything that could reach the port could write it: no browser,
 * no session, an anti-forgery pair minted by one unauthenticated GET of
 * /sign-in. The ticket is keyed with MASTER_KEY over the id of the session this
 * document is being rendered for, so a caller cannot compute one and cannot
 * lift one off a page served to nobody.
 *
 * The cookie is hashed here rather than read back through the database. The
 * session id IS that hash, the route checks the session is live before it
 * checks the ticket, and a layout that queried on every page render of every
 * screen would pay for it on /offline, which has to render with nothing behind
 * it. A ticket minted for a session that turns out to be dead buys its holder
 * nothing: the route refuses it at the door.
 *
 * No session, no ticket, and no report is raised at all. The sign-in screen
 * posts nothing, which is both correct, because a launch nobody has signed into
 * is not the fact C2 reads back, and the reason the old attack had a page to
 * mint its token from.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [csrfToken, jar] = await Promise.all([readCsrfToken(), cookies()]);
  const sessionCookie = jar.get(SESSION_COOKIE)?.value;
  const launchTicket = sessionCookie ? mintLaunchTicket(hashSessionToken(sessionCookie)) : null;

  return (
    <html lang="en" data-theme="dark">
      <head>
        {/*
          Next emits mobile-web-app-capable. Apple's own tag is the one
          documented to turn on full-screen mode, and the status bar style
          above has no effect without it, so both ship.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {children}
        <ServiceWorker />
        {launchTicket ? <DeviceReport csrfToken={csrfToken} launchTicket={launchTicket} /> : null}
      </body>
    </html>
  );
}
