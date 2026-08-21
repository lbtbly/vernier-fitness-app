import { OFFLINE_CSS } from '@/lib/offline-css';
import { strings } from '@/lib/strings';

/**
 * The offline screen as one finished document: html, head, the stylesheet
 * inline, body, and not one request to anything else.
 *
 * Why a string and not a component. The worker serves this from the cache at
 * the one moment nothing can be fetched. A React page needs its client chunk,
 * the chunk is named after the build hash, and a chunk that was never
 * requested while online is not in the cache, which is what painted "Failed to
 * load chunk" over this screen instead of the screen. Rendering the component
 * to markup on the server is not an option either: Next refuses an import of
 * react-dom/server from app code, and fighting that to keep the one screen
 * that must never break is the wrong trade. So the document is built here, by
 * hand, out of bytes it owns.
 *
 * The copy is the shell's own strings. The glyphs are copied from
 * src/components/icons.tsx, which is the only duplication in this file and the
 * price of owing nothing: importing those components would pull the framework
 * back in. Change a glyph there and change it here.
 *
 * The copy, the geometry and the single action are the offline card in
 * .forge/wireframes/00-patterns.html and 02-today.html.
 */
const CLOUD_OFF = `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M15.4 15.2H5.6a3.6 3.6 0 0 1-.5-7.16A4.7 4.7 0 0 1 13 6.1a3.4 3.4 0 0 1 3.3 3.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3l14 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;

const CALENDAR = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.4" y="4.6" width="17.2" height="16" rx="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.4 9.6h17.2M8 3.2v3M16 3.2v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

const WAVE = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12.5h4l2-5.5 3.6 11 2.4-7 1.5 1.5h5.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const DUMBBELL = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9v6M7 7.2v9.6M17 7.2v9.6M20 9v6M7 12h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;

const FORK = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 3v7M5 3v4.2a2 2 0 0 0 4 0V3M7 10v11M16.6 3c-1.8 2-1.8 6.4 0 8.4V21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const GEAR = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.6v3M12 18.4v3M21.4 12h-3M5.6 12h-3M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1M18.6 18.6l-2.1-2.1M7.5 7.5 5.4 5.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

const TABS = [
  { href: '/', label: strings.tabs.today, glyph: CALENDAR },
  { href: '/health', label: strings.tabs.health, glyph: WAVE },
  { href: '/train', label: strings.tabs.train, glyph: DUMBBELL },
  { href: '/eat', label: strings.tabs.eat, glyph: FORK },
  { href: '/settings', label: strings.tabs.settings, glyph: GEAR },
] as const;

// One line of behaviour, inline, so "Try again" reloads whatever address the
// owner actually asked for. Not a bundle, not an import, nothing to fetch.
const RETRY_SCRIPT =
  "document.getElementById('retry').addEventListener('click',function(){location.reload()})";

/**
 * Nothing on this screen comes from a request, but the host does come from
 * configuration, and configuration is written by a human. Escaped anyway.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderOfflineDocument({
  appName,
  originHost,
}: {
  appName: string;
  originHost: string;
}): string {
  const offline = strings.offline;
  const tabs = TABS.map(
    ({ href, label, glyph }) => `<a href="${href}">${glyph}${escapeHtml(label)}</a>`,
  ).join('');

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0A0A0B">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="robots" content="noindex">
<title>${escapeHtml(offline.title)} · ${escapeHtml(appName)}</title>
<style>${OFFLINE_CSS}</style>
</head>
<body>
<div class="app">
<main class="app-scroll">
<header class="title"><span class="lbl">${escapeHtml(offline.title)}</span><h1>${escapeHtml(offline.cardTitle)}</h1></header>
<div class="banner">${CLOUD_OFF}<div class="grow">${escapeHtml(offline.causePrefix)} <b>${escapeHtml(originHost)}</b>. ${escapeHtml(offline.causeSuffix)}</div></div>
<div class="card">
<span class="lbl">${escapeHtml(offline.worksTitle)}</span>
<p class="sub" style="margin-top:var(--s2)">${escapeHtml(offline.worksBody)}</p>
<div class="actions"><button type="button" id="retry" class="btn primary block">${escapeHtml(offline.action)}</button></div>
</div>
</main>
<nav class="tabbar" aria-label="Sections">${tabs}</nav>
</div>
<script>${RETRY_SCRIPT}</script>
</body>
</html>
`;
}
