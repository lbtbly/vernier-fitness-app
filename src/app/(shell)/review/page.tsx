import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { ReviewSections } from '@/components/ReviewSections';
import { ScreenTitle } from '@/components/ScreenTitle';
import { MailIcon, WarnIcon } from '@/components/icons';
import { readQuietHours } from '@/db/reminders';
import { describeIntegrations } from '@/db/integrations';
import { readReviewRow, readWeeklyReview, reviewedWeekOf } from '@/db/weekly-review';
import { getConfig } from '@/lib/config';
import { dayLabel, daysBetween, longDateTime } from '@/lib/format';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.review.title };
export const dynamic = 'force-dynamic';

/**
 * The weekly review, screen 11 frame 1. Sunday at 20:45, tired.
 *
 * THE WEEK IS READ BACK AND NOTHING IS SCORED. Nine sections, every figure
 * computed from the tables that already hold the week, a count beside anything
 * read from a short window, and no colour anywhere on a session that did not
 * happen. Two missed sessions because Thursday ran late is Tuesday, and the
 * denylist in src/lib/review-copy.ts is what holds that in the copy rather than
 * in anybody's intention.
 *
 * NOTHING ON THIS SCREEN WRITES. The proposal is the next screen and every
 * block on it is decided on its own; the calendar diff is the one after that.
 * The footer says so in words, because a person reading a summary at 20:45
 * should not have to wonder whether opening it changed anything.
 */
export default async function ReviewPage() {
  const { timeZone } = getConfig();
  const now = new Date();
  const weekStart = reviewedWeekOf(now, timeZone);

  const [review, row, quiet, integrations] = await Promise.all([
    readWeeklyReview(weekStart),
    readReviewRow(weekStart),
    readQuietHours(),
    describeIntegrations(),
  ]);

  const hasAnything = review.sections.some((section) =>
    section.rows.some((rowOfSection) => rowOfSection.value !== null),
  );
  const preparedDays =
    row === null ? null : daysBetween(row.generatedAt, now, timeZone);
  const mail = integrations.find((integration) => integration.provider === 'mail_relay');

  if (!hasAnything) {
    return (
      <>
        <ScreenTitle
          label={strings.review.weekOf(dayLabel(review.weekStart), dayLabel(review.weekEnd))}
          title={strings.review.title}
        />
        <EmptyState
          label={strings.review.title}
          title={strings.review.emptyTitle}
          body={strings.review.emptyBody}
          actionLabel={strings.quickLog.open}
          actionHref="/"
        />
        <div className="stickyfoot">
          <Link className="btn primary block" href="/review/next">
            {strings.review.seeNext}
          </Link>
          <p className="note centre" style={{ marginTop: 'var(--s2)' }}>
            {strings.review.nothingChanged}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenTitle
        label={strings.review.weekOf(dayLabel(review.weekStart), dayLabel(review.weekEnd))}
        title={strings.review.title}
      />

      {/*
        * The stale state, which on this screen means the review was prepared on
        * an earlier Sunday and is being read back later in the week. The chip
        * is `--warn` because the DATA is out of date, which is what warn is
        * for, and nothing about the week itself is coloured.
        */}
      {preparedDays !== null && preparedDays >= 1 ? (
        <div className="card" data-state="stale">
          <div className="between">
            <span className="lbl">{strings.review.title}</span>
            <span className="src stale">{strings.review.staleTitle(preparedDays)}</span>
          </div>
          <p className="sub" style={{ marginTop: 'var(--s2)' }}>
            {strings.review.staleBody}
          </p>
        </div>
      ) : null}

      {review.fix ? (
        <div className="banner w" data-fix>
          <WarnIcon />
          <div>
            <b>{review.fix.title}</b> {review.fix.body}
          </div>
        </div>
      ) : null}

      <ReviewSections review={review} />

      <section className="card flat" style={{ borderStyle: 'dashed' }}>
        <div className="between">
          <span className="lbl">{strings.review.emailLabel}</span>
          <span className="src">
            <MailIcon />
            {mail?.state === 'connected' ? strings.review.emailSent(
              row?.emailAt ? longDateTime(row.emailAt, timeZone) : strings.review.emailNotSent,
            ) : strings.review.emailChip}
          </span>
        </div>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {mail?.state === 'connected'
            ? strings.review.emailConfigured
            : strings.review.emailPreviewBody}
        </p>
        <div className="actions">
          <a className="btn block" href="/review/email">
            {strings.review.emailOpen}
          </a>
        </div>
      </section>

      <section className="card flat" style={{ borderStyle: 'dashed' }}>
        <span className="lbl">{strings.review.remindersLabel}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.review.remindersBody(strings.reminders.quietWindow(quiet.from, quiet.to))}
        </p>
      </section>

      <div className="stickyfoot">
        <Link className="btn primary block" href="/review/next">
          {strings.review.seeNext}
        </Link>
        <p className="note centre" style={{ marginTop: 'var(--s2)' }}>
          {strings.review.nothingChanged}
        </p>
      </div>
    </>
  );
}
