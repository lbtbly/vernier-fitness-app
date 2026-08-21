import type { Metadata, Viewport } from 'next';
import { DeviceReport } from '@/components/DeviceReport';
import { ServiceWorker } from '@/components/ServiceWorker';
import { getConfig } from '@/lib/config';
import './globals.css';

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
    description:
      'Vernier. One person, one health record, on one machine. Trends over days, provenance on every value, nothing written without a confirmed diff.',
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
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        <DeviceReport />
      </body>
    </html>
  );
}
