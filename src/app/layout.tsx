import type { Metadata, Viewport } from 'next';
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
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
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
 * Dark first. The attribute is written server side so the first paint is never
 * light, and the inline reader below hands the theme over to a system that
 * explicitly asks for light. Both theme blocks ship either way.
 */
const THEME_READER = `try{if(matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.dataset.theme='light'}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_READER }} />
      </head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
