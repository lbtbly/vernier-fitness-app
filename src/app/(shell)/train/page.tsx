import Link from 'next/link';
import { Progression, type ProgressionRow } from '@/components/Progression';
import { OfflineBanner } from '@/components/Queue';
import { ScreenTitle } from '@/components/ScreenTitle';
import { TrainWeek, type PlanRow } from '@/components/TrainWeek';
import { ChevronIcon, InfoIcon } from '@/components/icons';
import {
  painSiteLabel,
  readLatestReadiness,
  readPainReports,
  readProgressions,
  readProposals,
  readRestingHeartRate,
  upcomingWeekStart,
} from '@/db/training';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { daysBetween, longDayLabel, shortDate } from '@/lib/format';
import { DRIFT_AFTER_MINUTES, ESTIMATE_ERROR, OWNER_AGE, guidanceFor } from '@/lib/intensity';
import { dayAfter } from '@/lib/local-time';
import { screeningIsCurrent } from '@/lib/readiness';
import { strings } from '@/lib/strings';
import { repeatedSite } from '@/lib/training-rules';

export const metadata = { title: strings.train.title };
export const dynamic = 'force-dynamic';

/**
 * Train, screen 06.
 *
 * FOUR THINGS ARE ON THIS SCREEN AND THEIR ORDER IS THE ORDER OF WHAT IS DUE.
 * The screening gate if it has not been answered, because nothing else here
 * matters until it has. Then the proposed week, which is the point of the
 * screen. Then anything ready to advance, which can wait until Sunday. Then the
 * intensity guidance, which is reference rather than an action.
 *
 * ONE ANCHORING METHOD, EVER, AND NEVER BOTH. Percent heart-rate reserve when a
 * resting heart rate is stored, percent maximum when it is not. At a resting
 * rate of 60 those two disagree by eight beats at the bottom of the moderate
 * band, and a screen carrying both makes the owner arbitrate between two numbers
 * that came from the same app. Which one is drawn is decided once, here, by
 * whether the reading exists.
 *
 * WHAT IS NOT ON THIS SCREEN ANYWHERE: a five-zone dial, a live heart rate, a
 * readiness score, a workload ratio, an injury-risk number. Each one is either
 * falsified, dismissed by its own field, or a number this product has not
 * earned the measurements to print.
 */

/** After this many days a proposal was worked out from facts that have moved. */
const PROPOSAL_STALE_DAYS = 7;

export default async function TrainPage() {
  const { timeZone } = getConfig();
  const now = new Date();
  const weekStart = upcomingWeekStart(now, timeZone);
  const csrfToken = await readCsrfToken();

  let proposals: Awaited<ReturnType<typeof readProposals>> = [];
  let progressions: Awaited<ReturnType<typeof readProgressions>> = [];
  let readiness: Awaited<ReturnType<typeof readLatestReadiness>> = null;
  let resting: number | null = null;
  let painReports: Awaited<ReturnType<typeof readPainReports>> = [];
  let failed = false;
  try {
    [proposals, progressions, readiness, resting, painReports] = await Promise.all([
      readProposals(weekStart),
      readProgressions('proposed'),
      readLatestReadiness(),
      readRestingHeartRate(),
      readPainReports(4),
    ]);
  } catch (error) {
    // Screen 00's error state, on this screen, rather than the shell's own
    // boundary: an error names the failure and says what still works, and what
    // still works here is everything already accepted, which is on Today.
    console.error(`[vernier] train week read failed: ${(error as Error).message}`);
    failed = true;
  }

  const rows: PlanRow[] = proposals.map((proposal) => ({
    id: proposal.id,
    position: proposal.position,
    plannedFor: proposal.plannedFor.toISOString(),
    durationMinutes: proposal.durationMinutes,
    kind: proposal.kind,
    place: proposal.place,
    cause: proposal.cause,
    fullBody: proposal.fullBody,
    percentLonger: proposal.percentLonger,
    longestMinutes: proposal.longestMinutes,
    state: proposal.state,
    movements: proposal.movements.map((entry) => ({
      movementId: entry.movementId,
      sets: entry.sets,
      target: entry.target,
      loadKg: entry.loadKg,
      restSeconds: entry.restSeconds,
    })),
  }));

  const progressionRows: ProgressionRow[] = progressions.map((row) => ({
    id: row.id,
    movementId: row.movementId,
    lever: row.lever,
    fromLoadKg: row.fromLoadKg,
    toLoadKg: row.toLoadKg,
    fromTarget: row.fromTarget,
    toTarget: row.toTarget,
    toMovementId: row.toMovementId,
    trigger: row.trigger,
  }));

  const screeningDue = !screeningIsCurrent(readiness?.answeredAt ?? null, now);
  const blocked = repeatedSite(painReports);
  const guidance = guidanceFor(resting);

  // One accented action, on the thing due now. The page decides which surface
  // holds it, because the answer changes with the state.
  const accent = screeningDue
    ? 'readiness'
    : rows.length === 0
      ? 'week'
      : progressionRows.length > 0
        ? 'progression'
        : 'none';

  const strengthCount = rows.filter((row) => row.kind === 'strength').length;
  const cardioCount = rows.length - strengthCount;
  const totalMinutes = rows.reduce((sum, row) => sum + row.durationMinutes, 0);
  const oldest = proposals.length > 0 ? proposals[0] : null;
  const age = oldest ? daysBetween(oldest.plannedFor, now, timeZone) : 0;
  const staleDays = oldest && age > PROPOSAL_STALE_DAYS ? age : null;

  return (
    <div className="train">
      <ScreenTitle
        label={strings.trainWeek.label(
          shortDate(new Date(`${weekStart}T12:00:00Z`), 'UTC'),
          shortDate(new Date(`${dayAfter(weekStart, 6)}T12:00:00Z`), 'UTC'),
        )}
        title={strings.trainWeek.nextWeek}
      />

      <OfflineBanner />

      {failed ? (
        <div className="card error" data-state="error">
          <div className="between">
            <span className="lbl">{strings.trainWeek.nextWeek}</span>
            <span className="chip a">{strings.error.title}</span>
          </div>
          <div className="head">{strings.trainWeek.errorTitle}</div>
          <p className="sub">{strings.trainWeek.errorBody}</p>
          <div className="actions">
            <Link className="btn block" href="/train">
              {strings.common.retry}
            </Link>
          </div>
        </div>
      ) : null}

      {/* ---------- the screening gate, when it is due ---------- */}
      {screeningDue ? (
        <section className="card empty" data-card="readiness">
          <span className="lbl">{strings.readiness.title}</span>
          <div className="head">{strings.readiness.notAnswered}</div>
          <p className="sub">{strings.readiness.notAnsweredBody}</p>
          <div className="actions">
            <Link
              className={accent === 'readiness' ? 'btn primary block' : 'btn block'}
              href="/train/readiness"
            >
              {strings.readiness.answer}
            </Link>
          </div>
        </section>
      ) : (
        <section className="card tight" data-card="readiness-done">
          <Link className="row value-link" href="/train/readiness">
            <div className="stack grow">
              <span className="head">{strings.readiness.title}</span>
              <span className="note">
                {strings.readiness.answeredOn(
                  longDayLabel(readiness!.answeredAt.toISOString().slice(0, 10)),
                )}
              </span>
            </div>
            <ChevronIcon className="ch" />
          </Link>
        </section>
      )}

      {/* ---------- the week, one decision per row ---------- */}
      {rows.length > 0 ? (
        <section className="card tight" data-card="week-summary">
          <div className="between">
            <div className="stack">
              <span className="big num">{strings.trainWeek.sessionCount(rows.length)}</span>
              <span className="note">{strings.trainWeek.range(3, 5)}</span>
            </div>
            <div className="stack" style={{ alignItems: 'flex-end' }}>
              <span className="big num">
                {totalMinutes >= 60
                  ? strings.trainWeek.hoursAndMinutes(
                      Math.floor(totalMinutes / 60),
                      String(totalMinutes % 60).padStart(2, '0'),
                    )
                  : strings.trainWeek.duration(totalMinutes)}
              </span>
              <span className="note">{strings.trainWeek.total}</span>
            </div>
          </div>
          <p className="note" style={{ marginTop: '10px' }}>
            {strings.trainWeek.shape(strengthCount, cardioCount)}
          </p>
        </section>
      ) : null}

      <TrainWeek
        csrfToken={csrfToken}
        timeZone={timeZone}
        rows={rows}
        staleDays={staleDays}
        accented={accent === 'week'}
      />

      {/* ---------- what is ready to go up ---------- */}
      <Progression
        csrfToken={csrfToken}
        timeZone={timeZone}
        rows={progressionRows}
        blockedSite={blocked ? painSiteLabel(blocked) : null}
        accented={accent === 'progression'}
      />

      {/* ---------- intensity, as ranges, with one anchor ---------- */}
      <section className="card" data-card="intensity" data-anchor={guidance.anchor}>
        <div className="between">
          <span className="lbl">{strings.intensity.label}</span>
          <InfoIcon className="ch" />
        </div>
        {guidance.bands.map((band) => (
          <div className="row" key={band.band} data-band={band.band}>
            <span className="grow">{strings.intensity.bands[band.band]}</span>
            <span className="num">
              {band.openEnded
                ? strings.intensity.openRange(strings.intensity.bands[band.band], band.low)
                : strings.intensity.range(strings.intensity.bands[band.band], band.low, band.high)}
            </span>
          </div>
        ))}
        <p className="note" style={{ marginTop: 'var(--s2)' }} data-intensity="method">
          {guidance.anchor === 'reserve'
            ? strings.intensity.methodReserve(guidance.restingHeartRate!, guidance.maximum)
            : strings.intensity.methodMaximum(OWNER_AGE, guidance.maximum)}
        </p>
        <p className="note" data-intensity="error">
          {strings.intensity.error(ESTIMATE_ERROR.agreementLow, ESTIMATE_ERROR.agreementHigh)}
        </p>
        <p className="note" data-intensity="drift">
          {strings.intensity.drift(DRIFT_AFTER_MINUTES)}
        </p>
        <p className="note" data-intensity="no-tracking">
          {strings.intensity.noTracking}
        </p>
        <div className="row" style={{ marginTop: 'var(--s2)' }} data-intensity="talk-test">
          <div className="stack grow">
            <span className="head">{strings.intensity.talkTestLabel}</span>
            <span className="sub">{strings.intensity.talkTest}</span>
            <span className="note">{strings.intensity.talkTestModerate}</span>
            <span className="note">{strings.intensity.talkTestVigorous}</span>
          </div>
        </div>
      </section>

      {/* ---------- the catalogue and its provenance ---------- */}
      <section className="card" data-card="links">
        <Link className="row value-link" href="/train/catalogue">
          <div className="stack grow">
            <span className="head">{strings.catalogue.title}</span>
            <span className="note">{strings.catalogue.sub}</span>
          </div>
          <ChevronIcon className="ch" />
        </Link>
        <Link className="row value-link" href="/train/calendar">
          <div className="stack grow">
            <span className="head">{strings.calendar.diffTitle}</span>
            <span className="note">{strings.calendar.sub}</span>
          </div>
          <ChevronIcon className="ch" />
        </Link>
        <Link className="row value-link" href="/train/media">
          <div className="stack grow">
            <span className="head">{strings.media.title}</span>
            <span className="note">{strings.media.sub}</span>
          </div>
          <ChevronIcon className="ch" />
        </Link>
      </section>
    </div>
  );
}
