import { redirect } from 'next/navigation';
import { TabBar } from '@/components/TabBar';
import { readSession } from '@/lib/session';

/**
 * The five tabs live behind the gate. One check here covers every screen under
 * it, and the middleware has already turned away anyone with no cookie at all;
 * this is where a cookie that names no live session is refused.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect('/sign-in');

  return (
    <div className="app">
      <main className="app-scroll">{children}</main>
      <TabBar />
    </div>
  );
}
