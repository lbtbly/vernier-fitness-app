import Link from 'next/link';
import { CalendarDiff } from '@/components/CalendarDiff';
import { OfflineBanner } from '@/components/Queue';
import { ScreenTitle } from '@/components/ScreenTitle';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import {
  type PlanView,
  type WriteLogView,
  currentPlan,
  describeConnection,
  planView,
  writeLogView,
} from '@/lib/google/service';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.calendar.diffTitle };
export const dynamic = 'force-dynamic';

/**
 * The confirm diff, and the only screen in this product that can cause an event
 * to appear in the owner's calendar.
 *
 * NOTHING ON THIS PAGE WRITES ON ARRIVAL. It reads the connection, the plan that
 * is open if there is one, and the permanent write log. Working out what would
 * change is a button, applying it is a second button under a count, and both of
 * them are in `CalendarDiff`. A page that refreshed the plan on load would be
 * asking Google a question every time the owner glanced at the screen.
 */
export default async function CalendarPage() {
  const { timeZone } = getConfig();

  let view: Awaited<ReturnType<typeof describeConnection>> | null = null;
  let plan: PlanView | null = null;
  let writes: WriteLogView[] = [];
  let csrfToken = '';
  let failed = false;

  try {
    const [connection, open, log, token] = await Promise.all([
      describeConnection(),
      currentPlan(),
      writeLogView(),
      readCsrfToken(),
    ]);
    view = connection;
    plan = open ? await planView(open) : null;
    writes = log;
    csrfToken = token;
  } catch (error) {
    // Screen 00's error state on this screen rather than the shell's boundary:
    // an error names the failure and says what still works, and what still works
    // here is the training week, which does not need Google at all.
    console.error(`[vernier] calendar screen read failed: ${(error as Error).message}`);
    failed = true;
  }

  return (
    <div className="calendar-screen">
      <ScreenTitle label={strings.calendar.title} title={strings.calendar.diffTitle} sub={strings.calendar.diffSub} />

      <OfflineBanner />

      {failed || !view ? (
        <section className="card error" data-state="error">
          <div className="between">
            <span className="lbl">{strings.calendar.title}</span>
            <span className="chip a">{strings.error.title}</span>
          </div>
          <div className="head">{strings.calendar.errorTitleDiff}</div>
          <p className="sub">{strings.calendar.errorBodyDiff}</p>
          <div className="actions">
            <Link className="btn block" href="/train/calendar">
              {strings.common.retry}
            </Link>
          </div>
        </section>
      ) : (
        <CalendarDiff
          view={view}
          plan={plan}
          writes={writes}
          timeZone={timeZone}
          csrfToken={csrfToken}
        />
      )}
    </div>
  );
}
