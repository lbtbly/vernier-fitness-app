import Link from 'next/link';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { EmptyState } from '@/components/EmptyState';
import { OutboxBanner } from '@/components/OutboxBanner';
import { QuickLog } from '@/components/QuickLog';
import { ScreenTitle } from '@/components/ScreenTitle';
import { SourceChip } from '@/components/SourceChip';
import { ChevronIcon } from '@/components/icons';
import { recordRequestOrigin } from '@/db/diagnostics';
import { readCurrentValues, readOpenQuestions, readSourceRecordsFor, toView } from '@/db/measurements';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { metricLabel, valueLabel } from '@/lib/display';
import { longDate, shortDateTime } from '@/lib/format';
import { readRequestOrigin } from '@/lib/request-origin';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.today.title };
export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const { timeZone } = getConfig();

  // F4 and R1 both turn on the app answering from a second device on the
  // tailnet. The visit itself is the proof, so the visit is recorded: through
  // the proxy or not, and from which tailnet address. Evidence of origin,
  // never a credential; it decides nothing on this page or on any other.
  //
  // after(), so a slow write never delays Today, and inside a try so a database
  // that is down costs a log line and not the screen.
  // Only a request that came through the proxy carries a peer address. Next
  // fills x-forwarded-for from the socket for everything else, which on this
  // machine is the container bridge gateway: not a visitor, not evidence, and
  // a row that would only mislead.
  const { peerAddress, viaTailscale } = readRequestOrigin(await headers());
  if (viaTailscale && peerAddress) {
    after(async () => {
      try {
        await recordRequestOrigin({ peerAddress, viaTailscale });
      } catch (error) {
        console.error(`[vernier] request origin not recorded: ${(error as Error).message}`);
      }
    });
  }

  const [rows, questions, csrfToken] = await Promise.all([
    readCurrentValues(12),
    readOpenQuestions(),
    readCsrfToken(),
  ]);
  const records = await readSourceRecordsFor(rows);
  const values = rows.map((row) => toView(row, records));

  return (
    <>
      <ScreenTitle label={longDate(new Date(), timeZone)} title={strings.today.title} />

      {/*
        * Screen 03 frame 2 puts the queue count here, on Today, with the sheet
        * closed. Nothing is drawn when the queue is empty.
        */}
      <OutboxBanner />

      {questions.length > 0 ? (
        <Link className="banner w" href={`/value/${questions[0].measurementId}`}>
          <span className="grow">
            <b>{strings.question.title}</b> {strings.question.openCount(questions.length)}
          </span>
          <ChevronIcon className="ch" />
        </Link>
      ) : null}

      <section className="card">
        <span className="lbl">{strings.todayLog.needsLogging}</span>
        <p className="sub" style={{ margin: 'var(--s2) 0 var(--s3)' }}>
          {strings.todayLog.waistDue}
        </p>
        <QuickLog csrfToken={csrfToken} timeZone={timeZone} />
      </section>

      {values.length === 0 ? (
        <EmptyState
          label={strings.tabs.today}
          title={strings.today.emptyTitle}
          body={strings.today.emptyBody}
          actionLabel={strings.common.createAccount}
          actionHref="/sign-in"
        />
      ) : (
        <section className="card">
          {/*
            * "On file", not "Just logged". These are the values that stand
            * today, each one the head of its own correction chain; the card
            * the quick log raises above is the write that was made a moment
            * ago. Two cards, two things, two labels.
            */}
          <span className="lbl">{strings.todayLog.onFile}</span>
          {values.map((view) => {
            const label = valueLabel(view);
            return (
              /*
               * Tap 1. Every value on this screen is a link to its own sheet,
               * and the chip beside it names where it came from. Provenance is
               * not an inspector hidden behind a long press: it is one tap from
               * anywhere the number appears.
               */
              <Link className="row value-link" key={view.id} href={`/value/${view.id}`}>
                <div className="stack grow">
                  <span className="head">{metricLabel(view.metric)}</span>
                  <span className="sub num">
                    {label.number} {label.unit}
                  </span>
                  <span className="note num">{shortDateTime(new Date(view.measuredAt), timeZone)}</span>
                </div>
                <SourceChip source={view.source} confidence={view.confidence} />
                <ChevronIcon className="ch" />
              </Link>
            );
          })}
        </section>
      )}
    </>
  );
}
