'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map(({ href, label, Icon }) => {
        const current = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={current ? 'page' : undefined}>
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
