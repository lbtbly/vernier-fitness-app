import { ScreenTitle } from '@/components/ScreenTitle';
import { CloudOffIcon } from '@/components/icons';
import { RetryButton } from '@/components/RetryButton';
import { getConfig } from '@/lib/config';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.offline.title };

/**
 * Served by the worker when a navigation cannot reach the origin and nothing
 * matching is in the shell cache. C3: it names the cause and offers one action.
 * It is never a browser error page.
 */
export default function OfflinePage() {
  const { originHost } = getConfig();

  return (
    <>
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
          <RetryButton label={strings.offline.action} />
        </div>
      </div>
    </>
  );
}
