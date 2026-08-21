import Link from 'next/link';
import { ScreenTitle } from '@/components/ScreenTitle';
import { TabBar } from '@/components/TabBar';
import { strings } from '@/lib/strings';

export default function NotFound() {
  return (
    <div className="app">
      <main className="app-scroll">
        <ScreenTitle title={strings.notFound.title} />
        <div className="card empty">
          <span className="lbl">Vernier</span>
          <p className="sub" style={{ marginTop: 'var(--s2)' }}>
            {strings.notFound.body}
          </p>
          <div className="actions">
            <Link className="btn primary block" href="/">
              {strings.notFound.action}
            </Link>
          </div>
        </div>
      </main>
      <TabBar />
    </div>
  );
}
