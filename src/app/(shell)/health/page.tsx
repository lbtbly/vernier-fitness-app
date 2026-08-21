import { EmptyState } from '@/components/EmptyState';
import { ScreenTitle } from '@/components/ScreenTitle';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.health.title };

export default function HealthPage() {
  return (
    <>
      <ScreenTitle title={strings.health.title} sub={strings.health.sub} />
      <EmptyState
        label={strings.tabs.health}
        title={strings.health.emptyTitle}
        body={strings.health.emptyBody}
        actionLabel={strings.common.createAccount}
        actionHref="/sign-in"
      />
    </>
  );
}
