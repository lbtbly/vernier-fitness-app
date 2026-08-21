import { EmptyState } from '@/components/EmptyState';
import { ScreenTitle } from '@/components/ScreenTitle';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.eat.title };

export default function EatPage() {
  return (
    <>
      <ScreenTitle title={strings.eat.title} sub={strings.eat.sub} />
      <EmptyState
        label={strings.tabs.eat}
        title={strings.eat.emptyTitle}
        body={strings.eat.emptyBody}
        actionLabel={strings.common.createAccount}
        actionHref="/sign-in"
      />
    </>
  );
}
