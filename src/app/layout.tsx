import type { Metadata, Viewport } from 'next';
import { ServiceWorker } from '@/components/ServiceWorker';
import { getConfig } from '@/lib/config';
import './globals.css';
import { strings } from '@/lib/strings';

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
 * THE LAUNCH REPORT IS NOT RAISED HERE ANY MORE. It used to be, from the root,
 * so every document raised one including /sign-in, and that is the page a bare
 * curl minted its anti-forgery pair from before writing the row C2 reads back.
 * It lives in the shell layout now, which is the one place that has already
 * proven the session is live. The gate screen and the offline document raise
 * nothing at all: a launch nobody has signed into is not the fact C2 reads, and
 * a page rendered for nobody now hands out nothing a report could carry.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
      </body>
    </html>
  );
}
