import Link from 'next/link';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { ChartLegend } from '@/components/Chart';
import { EmptyState } from '@/components/EmptyState';
import { type Notice, NoticeRegion } from '@/components/Notices';
import { OfflineBanner, WhatHappensNext } from '@/components/Queue';
import { QuickLog, QuickLogTrigger } from '@/components/QuickLog';
import { ScreenTitle } from '@/components/ScreenTitle';
import { SourceChip } from '@/components/SourceChip';
import { StaleCause, StaleChip, staleNotice } from '@/components/StaleNotice';
import { WaistChart, WeightChart } from '@/components/WeightChart';
import { ChevronIcon, SyncIcon } from '@/components/icons';
import { recordRequestOrigin } from '@/db/diagnostics';
import { readAnalytes } from '@/db/labs';
import { readLatestPerMetric, readOpenQuestions, readSourceRecordsFor, toView } from '@/db/measurements';
import { TODAY_RANGE, readAdherenceScreen, readBodyScreen, readSignalScreen } from '@/db/screens';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { metricLabel, sleepLabel, valueLabel } from '@/lib/display';
import { dayLabel, daysBetween, formatNumber, longDate, shortDate, shortDateTime, time24 } from '@/lib/format';
import { readRequestOrigin } from '@/lib/request-origin';
import { strings } from '@/lib/strings';
import { AVERAGE_WINDOW, type Day, dayKey } from '@/lib/trend';

export const metadata = { title: strings.today.title };
export const dynamic = 'force-dynamic';

/**
 * The most rows Today's blood-panel card will ever draw, whatever the owner
 * stores.
 *
 * Amendment A5: an element inside a fixed budget either names every element
 * that spends it, or carries a maximum fixed by construction and states it as a
 * number. This card sits below the weight trend and spends none of the 715
 * pixels F27 counts, and this constant is what keeps that true of a screen
 * somebody reorders later. Four rows plus one summary line, and thirteen
 * analytes do not make it fourteen rows tall.
 */
const PANEL_ROWS_ON_TODAY = 4;

/**
 * Today, screen 02.
 *
 * It answers two questions above the fold and it answers them in this order:
 * what do I do today, and is my health improving. The trend leads, and this
 * morning's 85.9 kg never gets the big type, because a body-composition scale
 * moves with hydration by more than a good week of progress does.
 *
 * THE FOLD, AND WHAT EVERY ELEMENT ABOVE IT COSTS. The amended F27 puts the
 * session row, the meals, what needs logging and the weight trend inside 715
 * pixels at 393 by 852 with no scrolling, in every state the owner's data can
 * produce rather than in one, and it requires every element that can draw above
 * the trend to carry a maximum height fixed by construction. There are four,
 * and each one states its number where it is built:
 *
 *   the title header        63 px, fixed type on a fixed padding
 *   the offline line        62 px, clamped to two lines in the stylesheet
 *   the notice region       46 px, one summary row whatever it holds
 *   the day card           its own maximum, the session row plus three
 *
 * ADHERENCE IS BELOW THE TREND, AND THAT IS THE ORDER SCREEN 02 DRAWS. It sat
 * above the weight card for one round, because the old F27 named it inside the
 * fold and hoisting it was the cheapest way to pass. Three approved artifacts
 * put it below: DESIGN.md section 3, the screen table at DESIGN.md line 75, and
 * `02-today.html` frame 1's own caption, "Scrolls past the fold to adherence".
 * A5 struck the clause and F27 now forbids the hoist outright. The 182 px it
 * cost are what pay for the card geometry on this screen being section 3's.
 *
 * One accented action on this screen, and it is Quick log: the thing due now.
 */

/** Waist is due again three days after the last measurement. */
const WAIST_DUE_DAYS = 3;

/** A difference under this reads as being on the line rather than beside it. */
const ON_THE_LINE = 0.05;

function goalSentence(goalDelta: number | null, target: string, unit: string, when: string): string {
  if (goalDelta === null || Math.abs(goalDelta) < ON_THE_LINE) {
    return strings.goal.onTheLine(target, unit, when);
  }
  const size = formatNumber(Math.abs(goalDelta), unit);
  return goalDelta < 0
    ? strings.goal.below(size, unit, target, when)
    : strings.goal.above(size, unit, target, when);
}

function lastOf(days: Day[]) {
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].reading) return days[index];
  }
  return null;
}

function firstOf(days: Day[]) {
  return days.find((day) => day.reading) ?? null;
}

/** A day key as a calendar date rather than as an instant, for a label. */
function dayAsDate(on: string): Date {
  return new Date(`${on}T12:00:00Z`);
}

/** What one pill in the week row says, for the reader who cannot see it. */
function dayState(state: 'completed' | 'missed' | 'planned' | null): string {
  if (state === 'completed') return strings.adherence.dayDone;
  if (state === 'missed') return strings.adherence.dayMissed;
  if (state === 'planned') return strings.adherence.dayPlanned;
  return strings.adherence.dayNone;
}

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

  const [body, signals, plan, rows, questions, csrfToken] = await Promise.all([
    readBodyScreen(TODAY_RANGE),
    readSignalScreen(TODAY_RANGE),
    readAdherenceScreen(),
    readLatestPerMetric(),
    readOpenQuestions(),
    readCsrfToken(),
  ]);
  const records = await readSourceRecordsFor(rows);
  const values = rows.map((row) => toView(row, records));
  /*
   * The blood panel card, and the maximum it may be.
   *
   * Which metrics are laboratory values is read from the catalogue rather than
   * from a list in source, because slice 7 lets the owner add a fourteenth
   * analyte through the interface and a compiled list could not know about it.
   *
   * AND THE CARD IS BOUNDED BY CONSTRUCTION, WHICH F27 REQUIRES OF ANY ELEMENT
   * THAT COULD GROW. It used to hold one row because one analyte existed. With
   * thirteen seeded and a fourteenth possible its height would be a count of
   * the owner's data, so it draws at most PANEL_ROWS_ON_TODAY and states the
   * remainder as one line. It sits below the weight trend either way and spends
   * none of the 715 pixels above the fold; the cap is here so that stays true
   * of a screen somebody reorders later.
   */
  const analyteKeys = new Set((await readAnalytes()).map((analyte) => analyte.key));
  const labValues = values.filter((view) => analyteKeys.has(view.metric));

  const { summary, goal, weightDays, waistDays } = body;
  const now = body.now;
  const unit = goal?.unit ?? 'kg';
  const kg = strings.units.kg;
  const cm = strings.units.cm;
  const target = goal ? formatNumber(goal.targetValue, unit) : null;

  const lastWaist = lastOf(waistDays);
  const firstWaist = firstOf(waistDays);
  const waistAge = lastWaist ? daysBetween(dayAsDate(lastWaist.at), now, 'UTC') : null;
  const waistChange =
    lastWaist?.reading && firstWaist?.reading && firstWaist.at !== lastWaist.at
      ? lastWaist.reading.value - firstWaist.reading.value
      : null;

  const loggedEnergyToday = values.some(
    (view) => view.metric === 'energy' && dayKey(new Date(view.measuredAt), timeZone) === dayKey(now, timeZone),
  );
  const due = [
    ...(waistAge === null || waistAge >= WAIST_DUE_DAYS ? [strings.todayLog.waistDue] : []),
    ...(loggedEnergyToday ? [] : [strings.todayLog.energyDue]),
  ];

  const steps = lastOf(signals.series.get('steps') ?? []);
  const sleep = lastOf(signals.series.get('sleep_minutes') ?? []);
  const resting = lastOf(signals.series.get('resting_heart_rate') ?? []);
  const vo2 = lastOf(signals.series.get('vo2_max') ?? []);
  const phone = body.freshness.find((source) => source.source === 'apple_health_shortcut');
  const scale = body.freshness.find((source) => source.source === 'withings');

  // What Today has to raise above its first card. The region bounds the room
  // they take; each notice decides what it says.
  const questionNotice: Notice | null =
    questions.length === 0
      ? null
      : {
          id: 'question',
          tone: 'warn',
          summary: strings.question.openCount(questions.length),
          lines: [strings.question.title],
          href: `/value/${questions[0].measurementId}`,
        };
  const notices = [staleNotice(body.freshness, timeZone), questionNotice].filter(
    (notice): notice is Notice => notice !== null,
  );

  return (
    <div className="today">
      <ScreenTitle label={longDate(now, timeZone)} title={strings.today.title} />

      {/*
        * DESIGN.md section 4's offline line, first, because it is the owner's
        * own writing and it is the one thing under this title that is not a
        * problem. Neutral, one line, with the count on it. It is a client
        * island: the queue lives on this phone and the Mac mini cannot know it.
        */}
      <OfflineBanner />

      {/*
        * Then everything Today has to RAISE, in one region that is one line tall
        * whatever it holds.
        *
        * Two notices go in today and slices 5 to 14 add more: F55's ingest line
        * in slice 6, F133's three failure banners in slice 13. Nothing about the
        * fold changes when they do, because the region's height is fixed by
        * `.notices > summary` and not by how much is wrong.
        */}
      <NoticeRegion notices={notices} />

      {/* ---------- what do I do today ---------- */}
      <section className="card day">
        <span className="lbl">{strings.day.label}</span>

        {plan.today ? (
          <div className="row" data-session={plan.today.state}>
            <div className="stack grow">
              <span className="head">
                {plan.today.title}, {strings.day.minutes(plan.today.durationMinutes)}
              </span>
              <span className="sub num">
                {strings.day.when(
                  time24(plan.today.plannedFor, timeZone),
                  time24(
                    new Date(plan.today.plannedFor.getTime() + plan.today.durationMinutes * 60_000),
                    timeZone,
                  ),
                  plan.today.place,
                )}
              </span>
              {/*
                * The cause, in the owner's language. The panel's second finding
                * is that a reason names the fact acted on and a label names
                * nothing, and that one unexplained placement costs the whole
                * dashboard its credibility.
                */}
              <span className="note">{plan.today.cause}</span>
            </div>
            <span className="chip">{strings.day.states[plan.today.state]}</span>
          </div>
        ) : (
          <div className="row" data-session="none">
            <div className="stack grow">
              <span className="head">{strings.day.sessionNone}</span>
              <span className="sub">{strings.day.sessionNoneBody}</span>
            </div>
          </div>
        )}

        {/*
          * The two rows a write replaces, handed to the quick log rather than
          * drawn beside it. Screen 02 frame 3 draws the day card with the
          * session and then what was queued, and no meals or needs-logging row
          * under it: a write is the answer to both questions, so it takes their
          * place instead of pushing them down the screen. A6 fixes the day
          * card's maximum at the row count that sheet draws, and this is how it
          * is a constant rather than a promise.
          */}
        <QuickLog csrfToken={csrfToken} timeZone={timeZone}>
          {/*
            * Meals. The nutrition week is a later slice and nothing has been
            * logged, so this row says exactly that and carries no number at all.
            * A row reading "0 of 2,150 kcal" would be the app claiming a fact
            * about the day it does not have.
            */}
          <div className="row" data-meals="none">
            <span className="head grow">{strings.day.meals}</span>
            <span className="sub">{strings.day.mealsNone}</span>
          </div>

          <div className="row" data-due={due.length}>
            <div className="stack grow">
              <span className="head">{strings.todayLog.needsLogging}</span>
              <span className="sub">{due.length === 0 ? strings.todayLog.nothingDue : due.join(' ')}</span>
            </div>
            {due.length > 0 ? <span className="chip w">{strings.todayLog.dueCount(due.length)}</span> : null}
          </div>
        </QuickLog>
      </section>

      {/* ---------- is my health improving ---------- */}
      {summary.average?.mean != null ? (
        <section className="card" data-card="weight">
          <div className="between">
            <span className="lbl">{strings.metrics.weight_average_7d}</span>
            {summary.latest ? (
              <SourceChip source={summary.latest.origin} seed={summary.latest.seed} />
            ) : null}
          </div>
          <div className="between" style={{ alignItems: 'flex-end', margin: '2px 0 0' }}>
            <div className="metric" data-headline="average">
              {formatNumber(summary.average.mean, unit)} <small>{kg}</small>
            </div>
            {summary.weekChange !== null ? (
              <div className="stack" style={{ alignItems: 'flex-end' }}>
                {/*
                  * Down is the way the owner wants it, so down is --good. Up is
                  * not red and never will be: DESIGN.md reserves alert for an
                  * operation that failed, and a body that gained half a kilo
                  * has not failed at anything.
                  */}
                <span className={summary.weekChange < 0 ? 'strong num good' : 'strong num'}>
                  {formatNumber(summary.weekChange, unit)} {kg}
                </span>
                <span className="note">{strings.adherence.alsoLastDays(AVERAGE_WINDOW)}</span>
              </div>
            ) : null}
          </div>
          <WeightChart id="today-weight" days={weightDays} goal={goal} unit={unit} height={80} />
          <ChartLegend window={AVERAGE_WINDOW} goal={target ? { target, unit: kg } : null} />

          {/*
            * F29's goal on Today, and the four-week pace, together under the
            * chart. Screen 02 writes both on one line above it; here they are
            * two lines below it, and that is the second thing this screen buys
            * fold room with. F29 asks that the goal be visible on Today and
            * editable from Health, and it is both. F27 counts pixels above the
            * chart, and a sentence about the trajectory is a fact you read
            * after the trajectory, never before it.
            */}
          {goal && target ? (
            <p className="sub" style={{ marginTop: 'var(--s2)' }} data-goal-line="today">
              {goalSentence(summary.goalDelta, target, unit, shortDate(goal.targetAt, timeZone))}
            </p>
          ) : null}
          {goal ? (
            <p className="note" style={{ marginTop: 'var(--s1)' }} data-goal-line="pace">
              {summary.pace === null
                ? strings.goal.paceUnknown
                : strings.goal.pace(formatNumber(summary.pace, unit), kg)}
            </p>
          ) : null}

          {/*
            * Every hole in the window, named by its dates. One note per run,
            * because two gaps in a month are two facts and a single sentence
            * covering both would be the smoothing in prose.
            */}
          {summary.gaps.map((gap) => (
            <div className="gapnote" key={gap.from} data-gap={gap.from}>
              <span className="dot warnfill" />
              <p className="note">{strings.trend.gapNote(dayLabel(gap.from), dayLabel(gap.to))}</p>
            </div>
          ))}

          {/*
            * A figure computed on a short window states the count it rests on,
            * whether or not the line beside it could be drawn. This is the
            * sentence DESIGN.md quotes verbatim, and it is here rather than
            * inside the gap note because a window can be short without a gap
            * being long enough to draw.
            */}
          {summary.headlineWindow ? (
            <p className="note" data-window="headline">
              {strings.trend.headlineWindow(
                summary.headlineWindow.count,
                summary.headlineWindow.size,
              )}
            </p>
          ) : null}
          {summary.shortWindow ? (
            <p className="note" data-window="lastweek">
              {strings.trend.shortWindow(summary.shortWindow.count, summary.shortWindow.size)}
            </p>
          ) : null}

          {/*
            * F35. The daily reading is named here, under the chart, in note
            * type, with the reason it is not the headline sitting beside it.
            * It is a link, so the number the owner is most tempted to read is
            * also the number whose provenance is one tap away.
            */}
          {summary.latest && summary.latestAt ? (
            <p className="note" style={{ marginTop: 'var(--s2)' }} data-daily="secondary">
              <Link className="value-link" href={`/value/${summary.latest.id}`}>
                {strings.trend.legendDaily}, {dayLabel(summary.latestAt)}:{' '}
                {formatNumber(summary.latest.value, unit)} {kg}.
              </Link>{' '}
              {strings.today.hydration}
            </p>
          ) : null}
        </section>
      ) : (
        <EmptyState
          label={strings.metrics.weight}
          title={strings.today.emptyTitle}
          body={strings.today.emptyBody}
          actionLabel={strings.common.createAccount}
          actionHref="/sign-in"
        />
      )}

      {/*
        * "What happens next", screen 03 frame 2's dashed card, and A6 puts it
        * here rather than above the trend. It explains a queue the owner has
        * already been told about on the line under the title, so it is a thing
        * you read after the trend and never before it.
        */}
      <WhatHappensNext />

      {/* ---------- waist ---------- */}
      {lastWaist?.reading ? (
        <section className="card" data-card="waist">
          <div className="between">
            <span className="lbl">{strings.metrics.waist}</span>
            <SourceChip source={lastWaist.reading.origin} seed={lastWaist.reading.seed} />
          </div>
          <div className="between" style={{ alignItems: 'flex-end', margin: '6px 0 8px' }}>
            <div className="metric">
              {formatNumber(lastWaist.reading.value, 'cm')} <small>{cm}</small>
            </div>
            {waistChange !== null && firstWaist ? (
              <div className="stack" style={{ alignItems: 'flex-end' }}>
                <span className={waistChange < 0 ? 'strong num good' : 'strong num'}>
                  {formatNumber(waistChange, 'cm')} {cm}
                </span>
                <span className="note">{strings.today.since(dayLabel(firstWaist.at))}</span>
              </div>
            ) : null}
          </div>
          <WaistChart id="today-waist" days={waistDays} unit="cm" />
          {/*
            * Screen 02's own row: what the tape last said, and the control that
            * takes a fresh one. It raises the quick log rather than opening a
            * second waist form, because two ways to write one measurement is
            * two ways to get it wrong.
            */}
          <div className="between" style={{ marginTop: 'var(--s2)' }}>
            <span className="note grow">
              {waistAge !== null && waistAge >= WAIST_DUE_DAYS
                ? strings.quickLog.staleTitle(waistAge)
                : strings.today.waistMeasured(shortDateTime(lastWaist.reading.measuredAt, timeZone))}
            </span>
            <QuickLogTrigger label={strings.quickLog.measure} />
          </div>
        </section>
      ) : null}

      {/* ---------- adherence: a count over its denominator ---------- */}
      <section className="card adherence" data-adherence={plan.windows[0].planned}>
        <span className="lbl">{strings.adherence.label}</span>
        {plan.windows.every((window) => window.planned === 0) ? (
          <p className="sub" style={{ marginTop: 'var(--s2)' }}>
            {strings.adherence.emptyBody}
          </p>
        ) : (
          <div className="between">
            <div className="stack">
              <span className="big num" data-adherence-window="7">
                {strings.adherence.count(plan.windows[0].completed, plan.windows[0].planned)}
              </span>
              <span className="note">{strings.adherence.lastDays(plan.windows[0].days)}</span>
            </div>
            <div className="stack" style={{ alignItems: 'flex-end' }}>
              <span className="big num" data-adherence-window="28">
                {strings.adherence.count(plan.windows[1].completed, plan.windows[1].planned)}
              </span>
              <span className="note">{strings.adherence.alsoLastDays(plan.windows[1].days)}</span>
            </div>
          </div>
        )}

        {/*
          * The week, one pill a day, exactly as screen 02 draws it: done,
          * missed, today, and a day with nothing planned. Nothing here is
          * coloured red. A missed session is a Thursday that ran late, and the
          * sentence under the row is the panel's finding in the product's own
          * words, on the screen the owner opens every morning.
          *
          * The dates read "15 Aug", not the sheet's "Sat 15": DESIGN.md fixes
          * two date shapes for the whole product and this is one of them.
          */}
        {plan.week.length > 0 ? (
          <>
            <ul className="pills" data-week="adherence">
              {plan.week.map((day, index) => (
                <li
                  key={day.at}
                  data-day={day.state ?? 'none'}
                  data-today={index === plan.week.length - 1 ? '' : undefined}
                >
                  <span className="visually-hidden">
                    {strings.adherence.dayCell(dayLabel(day.at), dayState(day.state))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="between">
              <span className="note">{dayLabel(plan.week[0].at)}</span>
              <span className="note">{dayLabel(plan.week[plan.week.length - 1].at)}</span>
            </div>
            <p className="note" style={{ marginTop: 'var(--s2)' }} data-adherence-note>
              {strings.adherence.note}
            </p>
          </>
        ) : null}
      </section>

      {/* ---------- the five body signals ---------- */}
      <section className="card" data-card="signals">
        <div className="between">
          <span className="lbl">{strings.signals.label}</span>
          {phone?.stale ? <StaleChip freshness={phone} /> : <SourceChip source="apple_health_shortcut" />}
        </div>
        {phone?.stale ? <StaleCause freshness={phone} timeZone={timeZone} /> : null}

        <div className="row" data-signal="steps">
          <span className="grow">{strings.signals.steps}</span>
          {steps?.reading ? (
            <>
              <span className="num">
                {formatNumber(steps.reading.value, 'step')} {strings.units.step}
              </span>
              <span className="note num">{dayLabel(steps.at)}</span>
            </>
          ) : (
            <span className="note warn">{strings.stale.noDataNotZero}</span>
          )}
        </div>
        <div className="row" data-signal="sleep">
          <span className="grow">{strings.signals.sleep}</span>
          {sleep?.reading ? (
            <>
              <span className="num">{sleepLabel(sleep.reading.value)}</span>
              <span className="note num">{strings.signals.sleepNight(dayLabel(sleep.at))}</span>
            </>
          ) : (
            <span className="note warn">{strings.stale.noDataNotZero}</span>
          )}
        </div>
        <div className="row" data-signal="resting">
          <span className="grow">{strings.signals.resting}</span>
          {resting?.reading ? (
            <>
              <span className="num">
                {formatNumber(resting.reading.value, 'bpm')} {strings.units.bpm}
              </span>
              <span className="note num">{dayLabel(resting.at)}</span>
            </>
          ) : (
            <span className="note warn">{strings.stale.noDataNotZero}</span>
          )}
        </div>
        <div className="row" data-signal="vo2">
          <span className="grow">{strings.signals.vo2}</span>
          {vo2?.reading ? (
            <>
              <span className="num">{formatNumber(vo2.reading.value, 'mL/kg/min')}</span>
              <span className="note num">{dayLabel(vo2.at)}</span>
            </>
          ) : (
            <span className="note">{strings.signals.vo2Empty}</span>
          )}
        </div>
        {phone?.stale && phone.lastAt ? (
          <div className="row" data-signal="absent">
            <span className="grow mut">
              {strings.stale.affectedRange(
                dayLabel(dayKey(new Date(phone.lastAt.getTime() + 86_400_000), timeZone)),
                dayLabel(dayKey(now, timeZone)),
              )}
            </span>
            <span className="note warn">{strings.stale.noDataNotZero}</span>
          </div>
        ) : null}
        {scale?.stale ? <StaleCause freshness={scale} timeZone={timeZone} /> : null}

        {/*
          * Screen 02's control. The phone pushes and this machine never pulls,
          * so nothing here can end the silence: what the app can do is say
          * where the shortcut is set up, and the label says what actually
          * fixes it.
          */}
        <Link className="btn block" href="/settings" style={{ marginTop: 'var(--s3)' }}>
          <SyncIcon />
          {strings.signals.runShortcut}
        </Link>
      </section>

      {/* ---------- the last blood panel ---------- */}
      {labValues.length > 0 ? (
        <section className="card" data-card="panel">
          <div className="between">
            <span className="lbl">
              {strings.panel.label(shortDate(new Date(labValues[0].measuredAt), timeZone))}
            </span>
            <SourceChip source="lab_pdf" />
          </div>
          {labValues.slice(0, PANEL_ROWS_ON_TODAY).map((view) => {
            const label = valueLabel(view);
            return (
              <Link className="row value-link" key={view.id} href={`/value/${view.id}`}>
                <span className="grow">{metricLabel(view.metric)}</span>
                <span className="num">
                  {label.number} {label.unit}
                </span>
                <ChevronIcon className="ch" />
              </Link>
            );
          })}
          {labValues.length > PANEL_ROWS_ON_TODAY ? (
            <Link className="row value-link" href="/health">
              <span className="grow note">
                {strings.labs.seeAllOnHealth(labValues.length - PANEL_ROWS_ON_TODAY)}
              </span>
              <ChevronIcon className="ch" />
            </Link>
          ) : null}
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.panel.note}
          </p>
        </section>
      ) : null}

      {/* ---------- everything that stands today, one row per metric ---------- */}
      {values.length > 0 ? (
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
      ) : null}

      <p className="note centre" style={{ padding: '4px 20px 0' }}>
        {strings.today.closing}
      </p>
    </div>
  );
}
