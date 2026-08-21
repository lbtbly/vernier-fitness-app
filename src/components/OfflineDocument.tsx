import { renderToStaticMarkup } from 'react-dom/server';
import { ScreenTitle } from '@/components/ScreenTitle';
import {
  CalendarIcon,
  CloudOffIcon,
  DumbbellIcon,
  ForkIcon,
  GearIcon,
  WaveIcon,
} from '@/components/icons';
import { OFFLINE_CSS } from '@/lib/offline-css';
import { strings } from '@/lib/strings';

/**
 * The whole offline screen as one document: html, head, the stylesheet inline,
 * body. It is rendered to static markup by the /offline route handler and it
 * ships zero framework JavaScript.
 *
 * Why a document and not a page. The worker serves this from the cache when a
 * navigation cannot reach the origin, which is the one moment nothing else can
 * be fetched. A React page needs its client chunk, the chunk is named after the
 * build hash, and a chunk that was never requested while online is not in the
 * cache. That is what painted "Failed to load chunk" over this screen instead
 * of the screen. So: no <link>, no <script src>, no font file, no image. Every
 * byte this screen needs is inside the bytes the worker already has.
 *
 * The copy, the geometry and the single action are the offline card from
 * .forge/wireframes/00-patterns.html and 02-today.html. The icons are the same
 * components the rest of the shell draws, so there is one source for the shape.
 */
const TABS = [
  { href: '/', label: strings.tabs.today, Icon: CalendarIcon },
  { href: '/health', label: strings.tabs.health, Icon: WaveIcon },
  { href: '/train', label: strings.tabs.train, Icon: DumbbellIcon },
  { href: '/eat', label: strings.tabs.eat, Icon: ForkIcon },
  { href: '/settings', label: strings.tabs.settings, Icon: GearIcon },
] as const;

// One line of behaviour, inline, so "Try again" reloads whatever address the
// owner asked for. Not a bundle, not an import, nothing to fetch.
const RETRY_SCRIPT =
  "document.getElementById('retry').addEventListener('click',function(){location.reload()})";

type OfflineDocumentProps = { appName: string; originHost: string };

/**
 * The document as bytes, doctype included. The route handler serves this
 * string; nothing else renders it.
 */
export function renderOfflineDocument(props: OfflineDocumentProps): string {
  return `<!doctype html>${renderToStaticMarkup(<OfflineDocument {...props} />)}`;
}

function OfflineDocument({ appName, originHost }: OfflineDocumentProps) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0A0A0B" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="robots" content="noindex" />
        <title>{`${strings.offline.title} · ${appName}`}</title>
        <style dangerouslySetInnerHTML={{ __html: OFFLINE_CSS }} />
      </head>
      <body>
        <div className="app">
          <main className="app-scroll">
            <ScreenTitle label={strings.offline.title} title={strings.offline.cardTitle} />

            <div className="banner">
              <CloudOffIcon />
              <div className="grow">
                {strings.offline.causePrefix} <b>{originHost}</b>. {strings.offline.causeSuffix}
              </div>
            </div>

            <div className="card">
              <span className="lbl">{strings.offline.worksTitle}</span>
              <p className="sub" style={{ marginTop: 'var(--s2)' }}>
                {strings.offline.worksBody}
              </p>
              <div className="actions">
                <button type="button" id="retry" className="btn primary block">
                  {strings.offline.action}
                </button>
              </div>
            </div>
          </main>

          <nav className="tabbar" aria-label="Sections">
            {TABS.map(({ href, label, Icon }) => (
              <a key={href} href={href}>
                <Icon />
                {label}
              </a>
            ))}
          </nav>
        </div>
        <script dangerouslySetInnerHTML={{ __html: RETRY_SCRIPT }} />
      </body>
    </html>
  );
}
