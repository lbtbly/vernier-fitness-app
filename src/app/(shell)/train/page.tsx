import { EmptyState } from '@/components/EmptyState';
import { ScreenTitle } from '@/components/ScreenTitle';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.train.title };

export default function TrainPage() {
  return (
    <>
      <ScreenTitle title={strings.train.title} sub={strings.train.sub} />
      <EmptyState
        label={strings.tabs.train}
        title={strings.train.emptyTitle}
        body={strings.train.emptyBody}
        actionLabel={strings.common.createAccount}
        actionHref="/sign-in"
      />
    </>
  );
}
