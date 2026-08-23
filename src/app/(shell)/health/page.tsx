import Link from 'next/link';
import { ChartLegend } from '@/components/Chart';
import { EmptyState } from '@/components/EmptyState';
import { GoalEditor } from '@/components/GoalEditor';
import { ScreenTitle } from '@/components/ScreenTitle';
import { SourceChip } from '@/components/SourceChip';
import { HeartChart, SleepChart, StepsChart } from '@/components/SignalCharts';
import { StaleCause, StaleChip } from '@/components/StaleNotice';
import { BodyChart } from '@/components/WeightChart';
import { LabTrend } from '@/components/LabTrend';
import { ChevronIcon } from '@/components/icons';
import { readAnalyteSeries, readAnalytes, readOpenReviews } from '@/db/labs';
import { DEFAULT_RANGE, RANGES, readBodyScreen, readSignalScreen } from '@/db/screens';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { sleepLabel } from '@/lib/display';
import { dayLabel, formatNumber, longDate, shortDate, shortDateTime } from '@/lib/format';
import { analyteLabel } from '@/lib/lab-display';
import type { ReviewRow } from '@/lib/lab-review';
import { strings } from '@/lib/strings';
import { AVERAGE_WINDOW, type Day } from '@/lib/trend';

export const metadata = { title: strings.health.title };
export const dynamic = 'force-dynamic';

/**
 * Health, screen 04.
 *
 * The full trend view. Weight and waist share one time axis so the two curves
 * are read together and the four days the scale went quiet cut through both
 * bands in the same place. Activity, sleep and heart follow, each rendering its
 * value when it has one and naming its own absence when it does not, and none
 * of the five ever rendering a zero for a missing reading.
 *
 * The goal is edited here. Two fields, one save, and the trajectory on every
 * chart is redrawn on the next render, because the line is arithmetic over two
 * points rather than a stored curve. That save is the one accented action on
 * this screen.
 */

const RANGE_LABELS: Record<number, string> = {
  7: strings.health.range7,
  30: strings.health.range30,
  182: strings.health.range6m,
  365: strings.health.rangeYear,
};

function lastOf(days: Day[]) {
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].reading) return days[index];
  }
  return null;
}

function firstOf(days: Day[]) {
  return days.find((day) => day.reading) ?? null;
}

/** A difference under this reads as being on the line rather than beside it. */
const ON_THE_LINE = 0.05;

/**
 * Where the average sits against the trajectory, in words.
 *
 * The same sentence Today draws, from the same numbers, because two screens
 * saying different things about one goal on one morning is exactly the drift
 * the shared read in src/db/screens.ts exists to prevent.
 */
function goalSentence(goalDelta: number | null, target: string, unit: string, when: string): string {
  if (goalDelta === null || Math.abs(goalDelta) < ON_THE_LINE) {
    return strings.goal.onTheLine(target, unit, when);
  }
  const size = formatNumber(Math.abs(goalDelta), unit);
  return goalDelta < 0
    ? strings.goal.below(size, unit, target, when)
    : strings.goal.above(size, unit, target, when);
}

/** The calendar day an instant falls on, in the shape a date field holds. */
function dateFieldValue(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(at);
}

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { timeZone } = getConfig();
  const asked = Number((await searchParams).range ?? DEFAULT_RANGE);
  const range = (RANGES as readonly number[]).includes(asked) ? asked : DEFAULT_RANGE;

  const [body, signals, csrfToken, analytes, openReviews] = await Promise.all([
    readBodyScreen(range),
    readSignalScreen(range),
    readCsrfToken(),
    readAnalytes(),
    readOpenReviews(),
  ]);
  /*
   * The lab archive, which is the half of this screen DESIGN.md's information
   * architecture gives to Health: every trend on one screen, and the blood
   * panels among them.
   *
   * The catalogue is read from the database rather than from a list in source,
   * so an analyte the owner adds while reviewing a panel gets a trend on the
   * next render with no source file touched. That is F64, and it is the reason
   * `lab_analyte` is a table.
   *
   * An analyte with no stored value draws its own absence and never a flat line
   * at zero. A panel is a point, not a day, so these charts are not on the daily
   * axis the body charts use: two panels six months apart are two comparable
   * measurements and the space between them is not a gap in a series, it is the
   * six months in which nobody took blood.
   */
  const analyteSeries = await readAnalyteSeries(analytes.map((analyte) => analyte.key));
  const withReadings = analytes.filter((analyte) => (analyteSeries.get(analyte.key) ?? []).length > 0);
  const withoutReadings = analytes.filter(
    (analyte) => (analyteSeries.get(analyte.key) ?? []).length === 0,
  );

  const { summary, goal, weightDays, waistDays, now } = body;
  const unit = goal?.unit ?? 'kg';
  const kg = strings.units.kg;
  const cm = strings.units.cm;
  const target = goal ? formatNumber(goal.targetValue, unit) : null;

  const lastWaist = lastOf(waistDays);
  const firstWaist = firstOf(waistDays);
  const waistChange =
    lastWaist?.reading && firstWaist?.reading && firstWaist.at !== lastWaist.at
      ? lastWaist.reading.value - firstWaist.reading.value
      : null;

  const stepDays = signals.series.get('steps') ?? [];
  const sleepDays = signals.series.get('sleep_minutes') ?? [];
  const restingDays = signals.series.get('resting_heart_rate') ?? [];
  const hrvDays = signals.series.get('hrv') ?? [];
  const vo2Days = signals.series.get('vo2_max') ?? [];

  const steps = lastOf(stepDays);
  const sleep = lastOf(sleepDays);
  const resting = lastOf(restingDays);
  const restingFirst = firstOf(restingDays);
  const hrv = lastOf(hrvDays);
  const vo2 = lastOf(vo2Days);

  const phone = body.freshness.find((source) => source.source === 'apple_health_shortcut');
  const scale = body.freshness.find((source) => source.source === 'withings');

  const stepAverage =
    stepDays.filter((day) => day.reading).length > 0
      ? stepDays.reduce((total, day) => total + (day.reading?.value ?? 0), 0) /
        stepDays.filter((day) => day.reading).length
      : null;

  const restingChange =
    resting?.reading && restingFirst?.reading && restingFirst.at !== resting.at
      ? resting.reading.value - restingFirst.reading.value
      : null;

  return (
    <>
      <ScreenTitle label={longDate(now, timeZone)} title={strings.health.title} />

      <nav className="segctl" aria-label={strings.health.rangeLabel}>
        {RANGES.map((days) => (
          <Link
            key={days}
            href={`/health?range=${days}`}
            aria-current={days === range ? 'page' : undefined}
          >
            {RANGE_LABELS[days]}
          </Link>
        ))}
      </nav>

      {/* ---------- body: weight and waist on one axis ---------- */}
      {summary.average?.mean != null ? (
        <section className="card" data-card="body">
          <div className="between">
            <span className="lbl">{strings.signals.bodyLabel}</span>
            <span className="chips">
              {summary.latest ? (
                <SourceChip source={summary.latest.origin} seed={summary.latest.seed} />
              ) : null}
              {lastWaist?.reading ? (
                <SourceChip source={lastWaist.reading.origin} seed={lastWaist.reading.seed} />
              ) : null}
            </span>
          </div>

          <div className="headlines">
            <div className="stack">
              <span className="metric" data-headline="average">
                {formatNumber(summary.average.mean, unit)} <small>{kg}</small>
              </span>
              <span className="note">
                {summary.weekChange === null
                  ? strings.signals.averagePlain(AVERAGE_WINDOW)
                  : strings.signals.averageNote(
                      AVERAGE_WINDOW,
                      formatNumber(summary.weekChange, unit),
                      kg,
                    )}
              </span>
            </div>
            {lastWaist?.reading ? (
              <div className="stack">
                <span className="metric">
                  {formatNumber(lastWaist.reading.value, 'cm')} <small>{cm}</small>
                </span>
                <span className="note">
                  {waistChange === null || !firstWaist
                    ? strings.signals.waistPlain
                    : strings.signals.waistSince(
                        formatNumber(waistChange, 'cm'),
                        cm,
                        dayLabel(firstWaist.at),
                      )}
                </span>
              </div>
            ) : null}
          </div>

          <BodyChart
            id="health-body"
            days={weightDays}
            waistDays={waistDays}
            goal={goal}
            unit={unit}
            waistUnit="cm"
          />
          <ChartLegend window={AVERAGE_WINDOW} goal={target ? { target, unit: kg } : null} />

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
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.trend.dashedNote}
          </p>

          {/*
            * F35's sentence, on the screen the rubric names. It is the reason
            * the headline above is an average and this morning's reading is a
            * note under a chart.
            */}
          <p className="note" style={{ marginTop: 'var(--s2)' }} data-hydration="stated">
            {strings.health.hydration}
          </p>
        </section>
      ) : (
        <EmptyState
          label={strings.signals.bodyLabel}
          title={strings.health.emptyTitle}
          body={strings.health.emptyBody}
          actionLabel={strings.common.createAccount}
          actionHref="/sign-in"
        />
      )}

      {/* ---------- the goal, edited here ---------- */}
      <section className="card" data-card="goal">
        <span className="lbl">{strings.goal.label}</span>
        {goal && target ? (
          <>
            <div className="head" data-goal-line="health">
              {goalSentence(summary.goalDelta, target, unit, shortDate(goal.targetAt, timeZone))}
            </div>
            <p className="sub">
              {strings.goal.from(
                formatNumber(goal.startValue, unit),
                kg,
                shortDate(goal.startAt, timeZone),
              )}{' '}
              {strings.goal.corridor(formatNumber(0.5, unit), kg)}
            </p>
            <GoalEditor
              targetValue={formatNumber(goal.targetValue, unit)}
              targetDate={dateFieldValue(goal.targetAt, timeZone)}
              unit={kg}
              csrfToken={csrfToken}
            />
          </>
        ) : (
          <>
            <div className="head">{strings.goal.emptyTitle}</div>
            <p className="sub">{strings.goal.emptyBody}</p>
          </>
        )}
      </section>

      {/* ---------- activity ---------- */}
      <section className={steps?.reading ? 'card' : 'card empty'} data-card="activity">
        <div className="between">
          <span className="lbl">{strings.signals.activity}</span>
          {phone?.stale ? <StaleChip freshness={phone} /> : <SourceChip source="apple_health_shortcut" />}
        </div>
        {phone?.stale ? <StaleCause freshness={phone} timeZone={timeZone} /> : null}
        {steps?.reading && stepAverage !== null ? (
          <>
            <div className="between" style={{ alignItems: 'flex-end', margin: '8px 0 10px' }}>
              <div className="stack">
                <span className="metric">{formatNumber(steps.reading.value, 'step')}</span>
                <span className="note">{strings.signals.stepsOn(dayLabel(steps.at))}</span>
              </div>
              <div className="stack" style={{ alignItems: 'flex-end' }}>
                <span className="big num">{formatNumber(stepAverage, 'step')}</span>
                <span className="note">{strings.signals.stepsAverage(range)}</span>
              </div>
            </div>
            <StepsChart id="health-steps" days={stepDays} />
          </>
        ) : (
          <div data-empty="steps">
            <div className="head">{strings.signals.stepsEmptyTitle}</div>
            <p className="sub">{strings.signals.stepsEmptyBody}</p>
            <div className="actions">
              <Link className="btn" href="/settings">
                {strings.signals.openIntegrations}
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ---------- sleep ---------- */}
      <section className={sleep?.reading ? 'card' : 'card empty'} data-card="sleep">
        <div className="between">
          <span className="lbl">{strings.signals.sleep}</span>
          {phone?.stale ? <StaleChip freshness={phone} /> : <SourceChip source="apple_health_shortcut" />}
        </div>
        {sleep?.reading ? (
          <>
            <div className="between" style={{ alignItems: 'flex-end', margin: '8px 0 10px' }}>
              <div className="stack">
                <span className="metric">{sleepLabel(sleep.reading.value)}</span>
                <span className="note">{strings.signals.sleepNight(dayLabel(sleep.at))}</span>
              </div>
            </div>
            <SleepChart id="health-sleep" days={sleepDays} render={sleepLabel} />
            <p className="note" style={{ marginTop: 'var(--s2)' }}>
              {strings.signals.sleepNote}
            </p>
          </>
        ) : (
          <div data-empty="sleep">
            <div className="head">{strings.signals.sleepEmptyTitle}</div>
            <p className="sub">{strings.signals.sleepEmptyBody}</p>
            <div className="actions">
              <Link className="btn" href="/settings">
                {strings.signals.openIntegrations}
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ---------- heart: resting, recovery and VO2 max ---------- */}
      <section className={resting?.reading ? 'card' : 'card empty'} data-card="heart">
        <div className="between">
          <span className="lbl">{strings.signals.heart}</span>
          {phone?.stale ? <StaleChip freshness={phone} /> : <SourceChip source="apple_health_shortcut" />}
        </div>
        {resting?.reading ? (
          <>
            <div className="between" style={{ alignItems: 'flex-end', margin: '8px 0 10px' }}>
              <div className="stack">
                <span className="metric">
                  {formatNumber(resting.reading.value, 'bpm')} <small>{strings.units.bpm}</small>
                </span>
                <span className="note">{strings.signals.restingOn(dayLabel(resting.at))}</span>
              </div>
              {restingChange !== null ? (
                <div className="stack" style={{ alignItems: 'flex-end' }}>
                  <span className={restingChange < 0 ? 'big num good' : 'big num'}>
                    {formatNumber(restingChange, 'bpm')}
                  </span>
                  <span className="note">{strings.signals.changeOver(range)}</span>
                </div>
              ) : null}
            </div>
            <HeartChart id="health-heart" days={restingDays} />
          </>
        ) : (
          <div data-empty="resting">
            <div className="head">{strings.signals.restingEmptyTitle}</div>
            <p className="sub">{strings.signals.restingEmptyBody}</p>
            <div className="actions">
              <Link className="btn" href="/settings">
                {strings.signals.openIntegrations}
              </Link>
            </div>
          </div>
        )}

        <div className="row" data-signal="recovery">
          <span className="grow">{strings.signals.recovery}</span>
          {hrv?.reading ? (
            <>
              <span className="num">
                {formatNumber(hrv.reading.value, 'ms')} {strings.units.ms}
              </span>
              <span className="note num">{dayLabel(hrv.at)}</span>
            </>
          ) : (
            <span className="note" data-empty="recovery">
              {strings.signals.recoveryEmpty}
            </span>
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
            <span className="note" data-empty="vo2">
              {strings.signals.vo2Empty}
            </span>
          )}
        </div>
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.signals.vo2Note}
        </p>
        {scale?.stale ? <StaleCause freshness={scale} timeZone={timeZone} /> : null}
      </section>

      {/* ---------- the blood panels: one trend per analyte ---------- */}
      <div className="between" style={{ margin: 'var(--s6) 0 var(--s2)' }}>
        <span className="lbl">{strings.labs.trendsLabel}</span>
        <SourceChip source="lab_pdf" />
      </div>

      {/*
        * A review left open is a thing waiting on the owner, and silence is the
        * failure mode this product was built against. It is named here rather
        * than left to be rediscovered on the labs screen.
        */}
      {openReviews.map((review) => (
        <Link
          className="card tight row value-link"
          key={review.id}
          href={`/health/labs/${review.id}`}
          data-open-review={review.id}
        >
          <span className="grow stack">
            <span className="strong">{strings.labs.inReviewLabel}</span>
            <span className="note num">
              {strings.labs.inReviewCount(
                (review.extraction as ReviewRow[]).length,
                shortDateTime(review.uploadedAt, timeZone),
              )}
            </span>
          </span>
          <ChevronIcon className="ch" />
        </Link>
      ))}

      {withReadings.length === 0 ? (
        <EmptyState
          label={strings.labs.trendsLabel}
          title={strings.labs.archiveEmptyTitle}
          body={strings.labs.archiveEmptyBody}
          actionLabel={strings.labs.openLabs}
          actionHref="/health/labs"
        />
      ) : (
        <>
          {withReadings.map((analyte) => (
            <LabTrend
              key={analyte.key}
              id={`health-analyte-${analyte.key}`}
              analyte={analyte}
              readings={analyteSeries.get(analyte.key) ?? []}
              timeZone={timeZone}
            />
          ))}
          {/*
            * Absence drawn as absence. An analyte the catalogue holds and the
            * panels never carried says so in one row and gets no chart, because
            * a chart with no points is a shape that reads like data.
            */}
          {withoutReadings.length > 0 ? (
            <section className="card empty" data-card="analytes-empty">
              <span className="lbl">{strings.labs.trendsLabel}</span>
              {withoutReadings.map((analyte) => (
                <div className="row" key={analyte.key} data-analyte-empty={analyte.key}>
                  <span className="grow note">{strings.labs.trendEmpty(analyteLabel(analyte))}</span>
                </div>
              ))}
            </section>
          ) : null}
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.labs.trendsNote}
          </p>
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.panel.note}
          </p>
          <div className="actions">
            <Link className="btn block" href="/health/labs">
              {strings.labs.openLabs}
            </Link>
          </div>
        </>
      )}

      <p className="note centre" style={{ padding: '4px 16px 0' }}>
        {strings.health.closing}
      </p>
      <p className="note centre" style={{ padding: 'var(--s2) 16px 0' }}>
        {strings.health.noBloodPressure}
      </p>
    </>
  );
}
