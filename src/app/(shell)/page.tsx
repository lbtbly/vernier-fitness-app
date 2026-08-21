import { EmptyState } from '@/components/EmptyState';
import { ScreenTitle } from '@/components/ScreenTitle';
import { getConfig } from '@/lib/config';
import { longDate } from '@/lib/format';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.today.title };

export default function TodayPage() {
  const { timeZone } = getConfig();
  return (
    <>
      <ScreenTitle label={longDate(new Date(), timeZone)} title={strings.today.title} />
      <EmptyState
        label={strings.tabs.today}
        title={strings.today.emptyTitle}
        body={strings.today.emptyBody}
        actionLabel={strings.common.createAccount}
        actionHref="/sign-in"
      />
    </>
  );
}
