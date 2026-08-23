import Link from 'next/link';
import { OfflineBanner } from '@/components/Queue';
import { ReadinessGate, type ReadinessAnswerView } from '@/components/ReadinessGate';
import { ScreenTitle } from '@/components/ScreenTitle';
import { readLatestReadiness } from '@/db/training';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { daysBetween, longDateTime } from '@/lib/format';
import { SCREENING_VALID_DAYS, screeningIsCurrent } from '@/lib/readiness';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.readiness.title };
export const dynamic = 'force-dynamic';

/**
 * The screening gate. Three questions, once a year, and a referral decision.
 *
 * The five states are all real here. Loading is the shell's own skeleton while
 * the read is in flight. Empty is the never-answered state, which is the reason
 * the screen exists. Error is a failed read, and it says the plan is untouched.
 * Offline is the banner, because a saved answer is a write like any other.
 * Stale is an answer older than a year, which is when the guidance says to ask
 * again rather than assume the last answer still holds.
 */

export default async function ReadinessPage() {
  const { timeZone } = getConfig();
  const now = new Date();
  const csrfToken = await readCsrfToken();

  let answered: ReadinessAnswerView | null = null;
  let failed = false;
  try {
    const row = await readLatestReadiness();
    answered = row
      ? {
          activity: row.activity,
          knownDisease: row.knownDisease,
          symptoms: row.symptoms,
          desiredIntensity: row.desiredIntensity,
          outcome: row.outcome,
          answeredAt: row.answeredAt.toISOString(),
        }
      : null;
  } catch (error) {
    console.error(`[vernier] readiness read failed: ${(error as Error).message}`);
    failed = true;
  }

  const answeredAt = answered ? new Date(answered.answeredAt) : null;
  const current = screeningIsCurrent(answeredAt, now);
  const age = answeredAt ? daysBetween(answeredAt, now, timeZone) : null;

  return (
    <div className="readiness">
      <ScreenTitle
        label={strings.train.title}
        title={strings.readiness.title}
        sub={strings.readiness.sub}
      />

      <OfflineBanner />

      {failed ? (
        <div className="card error" data-state="error">
          <div className="between">
            <span className="lbl">{strings.readiness.title}</span>
            <span className="chip a">{strings.error.title}</span>
          </div>
          <div className="head">{strings.trainWeek.errorTitle}</div>
          <p className="sub">{strings.trainWeek.errorBody}</p>
          <div className="actions">
            <Link className="btn block" href="/train/readiness">
              {strings.common.retry}
            </Link>
          </div>
        </div>
      ) : null}

      {!failed && answered === null ? (
        <div className="card empty" data-state="empty">
          <span className="lbl">{strings.readiness.title}</span>
          <div className="head">{strings.readiness.notAnswered}</div>
          <p className="sub">{strings.readiness.notAnsweredBody}</p>
        </div>
      ) : null}

      {answeredAt && !current ? (
        <div className="card" data-state="stale">
          <div className="between">
            <span className="lbl">{strings.readiness.title}</span>
            <span className="src stale">{strings.trainWeek.staleTitle(age ?? SCREENING_VALID_DAYS)}</span>
          </div>
          <p className="sub">{strings.readiness.notAnsweredBody}</p>
        </div>
      ) : null}

      {answeredAt && current ? (
        <div className="card tight" data-state="answered">
          <span className="note">
            {strings.readiness.answeredOn(longDateTime(answeredAt, timeZone))}
          </span>
        </div>
      ) : null}

      <ReadinessGate csrfToken={csrfToken} answered={answered} />

      <p className="note centre" style={{ padding: 'var(--s3) 20px 0' }}>
        <Link className="value-link" href="/train">
          {strings.trainWeek.back}
        </Link>
      </p>
    </div>
  );
}
