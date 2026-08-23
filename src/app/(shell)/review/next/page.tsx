import Link from 'next/link';
import { ReviewProposal } from '@/components/ReviewProposal';
import { ScreenTitle } from '@/components/ScreenTitle';
import { describeIntegrations } from '@/db/integrations';
import { readWeeklyReview, reviewedWeekOf } from '@/db/weekly-review';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { dayAfter } from '@/lib/local-time';
import { dayLabel } from '@/lib/format';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.review.nextTitle };
export const dynamic = 'force-dynamic';

/**
 * Next week, screen 11 frame 2. Three blocks, each confirmable on its own.
 *
 * F121's "proposes the next one as a confirmable diff" and DESIGN.md section
 * 5's first decision are the same rule seen twice: there is no control on this
 * screen that decides more than the block it sits in. Declining the menu says
 * nothing about the sessions, and neither of them writes to a calendar from
 * here. The footer counts what has been decided; it does not commit anything.
 *
 * THE CALENDAR IS A STATE AND NOT A LINK TO NOWHERE. Google Calendar is slice
 * 11's, and until it is connected this screen says so in words and points at
 * the one place it can be connected, rather than offering a control that leads
 * to an empty screen.
 */
export default async function NextWeekPage() {
  const { timeZone } = getConfig();
  const weekStart = reviewedWeekOf(new Date(), timeZone);
  const [review, csrfToken, integrations] = await Promise.all([
    readWeeklyReview(weekStart),
    readCsrfToken(),
    describeIntegrations(),
  ]);

  const nextWeekStart = review.nextWeekStart;
  const calendar = integrations.find((integration) => integration.provider === 'google_calendar');

  return (
    <>
      <ScreenTitle
        label={strings.review.weekOf(dayLabel(nextWeekStart), dayLabel(dayAfter(nextWeekStart, 6)))}
        title={strings.review.nextTitle}
      />

      <ReviewProposal
        csrfToken={csrfToken}
        weekStart={nextWeekStart}
        blocks={review.proposal}
        connectedCalendar={calendar?.state === 'connected'}
      />

      <section className="card flat" style={{ borderStyle: 'dashed' }}>
        <span className="lbl">{strings.review.notProposedLabel}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.review.notProposedBody}
        </p>
      </section>

      <p className="note centre" style={{ padding: '4px 20px 0' }}>
        <Link href="/review">{strings.review.back}</Link>
      </p>
    </>
  );
}
