'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isImmersiveRoute } from '@/lib/routes';
import { strings } from '@/lib/strings';
import { CalendarIcon, DumbbellIcon, ForkIcon, GearIcon, WaveIcon } from './icons';

const TABS = [
  { href: '/', label: strings.tabs.today, Icon: CalendarIcon },
  { href: '/health', label: strings.tabs.health, Icon: WaveIcon },
  { href: '/train', label: strings.tabs.train, Icon: DumbbellIcon },
  { href: '/eat', label: strings.tabs.eat, Icon: ForkIcon },
  { href: '/settings', label: strings.tabs.settings, Icon: GearIcon },
] as const;

export function TabBar() {
  const pathname = usePathname();

  /*
   * THE PLAYER GETS NO TAB BAR, AND IT IS GONE RATHER THAN HIDDEN.
   *
   * `display:none` would take it out of hit testing and leave five links in the
   * markup of a screen screen 07 draws none on. Returning null removes the
   * nodes, so nothing can be tapped, focused, read by a screen reader or found
   * by a walk of the document. `.app-scroll:has(.player)` in globals.css drops
   * the bottom padding this bar reserves, which is what pulls Set done back
   * inside the viewport instead of leaving it under a bar that is not there.
   */
  if (isImmersiveRoute(pathname)) return null;

  return (
    <nav className="tabbar" aria-label={strings.common.sections}>
      {TABS.map(({ href, label, Icon }) => {
        const current = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          /*
           * No prefetch on the tab bar, deliberately.
           *
           * Every shell route is `force-dynamic`, so a prefetch is a whole
           * server render thrown away: five tabs on every screen means four
           * speculative renders per visit, on a machine that is one room away
           * and answers in milliseconds. It also produced the only failed
           * requests on the screen, because a prefetch in flight when the owner
           * taps is a prefetch the browser cancels, and C9 counts those.
           */
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={current ? 'page' : undefined}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
