import {
  AverageHead,
  AverageLine,
  AxisLabels,
  ChartFrame,
  ChartTable,
  type ChartRow,
  Corridor,
  DailyDots,
  GoalTrajectory,
  GridLines,
  Hatch,
  SeriesLine,
} from '@/components/Chart';
import {
  averageHead,
  averagePaths,
  boxOf,
  dotsOf,
  gapBands,
  goalGeometry,
  gridLines,
  linePath,
  wholeDomain,
} from '@/lib/chart';
import { sourceLabel } from '@/lib/display';
import { dayLabel, formatNumber } from '@/lib/format';
import { strings } from '@/lib/strings';
import {
  AVERAGE_WINDOW,
  GOAL_CORRIDOR,
  type Day,
  type Goal,
  findGaps,
  goalValueOn,
  rollingAverage,
} from '@/lib/trend';

/**
 * The weight trend, which is the one chart the whole product is built around.
 *
 * The hierarchy is fixed and is not a style choice: the seven-day average is
 * the loudest object, the goal trajectory is quiet and dashed, the daily
 * readings are the faintest thing on the card and are never joined. A scale
 * reading moves with hydration by more than a good week of progress, so a line
 * through the daily dots would be a line through water.
 *
 * Every hole is drawn as a hole. A run of three days or more is hatched at 45
 * degrees and labelled with its dates, the average is broken across it rather
 * than bridged, and where the window behind the average is short the line goes
 * dashed and the card states the count.
 */

/** Where a point walks to. Tap 1 is the value sheet; tap 2 is its source. */
const valueHref = (id: string) => `/value/${id}`;

function tableRows(days: Day[], unit: string): ChartRow[] {
  return days.map((day) => ({
    at: day.at,
    when: dayLabel(day.at),
    value: day.reading
      ? `${formatNumber(day.reading.value, unit)} ${strings.units[unit as keyof typeof strings.units] ?? unit}`
      : null,
    source: day.reading ? sourceLabel(day.reading.origin) : null,
  }));
}

function goalLabels(goal: Goal | null) {
  if (!goal) return null;
  return { target: formatNumber(goal.targetValue, goal.unit), unit: goal.unit };
}

function dayAsDate(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

export function WeightChart({
  id,
  days,
  goal,
  unit,
  height = 120,
}: {
  id: string;
  days: Day[];
  goal: Goal | null;
  unit: string;
  height?: number;
}) {
  const box = boxOf(height);
  const average = rollingAverage(days);
  const gaps = findGaps(days);
  const bands = gapBands(gaps, days.length, box);

  const firstDay = dayAsDate(days[0].at);
  const lastDay = dayAsDate(days[days.length - 1].at);
  const goalAt = goal
    ? [goalValueOn(goal, firstDay), goalValueOn(goal, lastDay)].filter(
        (value): value is number => value !== null,
      )
    : [];
  const domain = wholeDomain([
    ...days.flatMap((day) => (day.reading ? [day.reading.value] : [])),
    ...average.flatMap((point) => (point.value === null ? [] : [point.value])),
    ...goalAt.flatMap((value) => [value + GOAL_CORRIDOR, value - GOAL_CORRIDOR]),
  ]);

  const geometry = goal ? goalGeometry(goal, firstDay, lastDay, domain, box) : null;
  const head = averageHead(average, domain, box, days.length);
  const labels = goalLabels(goal);

  return (
    <ChartFrame
      id={id}
      height={height}
      title={strings.trend.weightTitle(days.length)}
      desc={strings.trend.weightDesc}
      caption={strings.trend.captionWeight}
      rows={tableRows(days, unit)}
    >
      {geometry ? <Corridor corridor={geometry.corridor} /> : null}
      <GridLines lines={gridLines(domain, box, 3)} unit={unit} box={box} />
      <Hatch id={id} bands={bands} top={box.top} bottom={box.bottom} />
      {geometry ? <GoalTrajectory line={geometry.line} /> : null}
      <DailyDots dots={dotsOf(days, domain, box)} href={valueHref} />
      <AverageLine segments={averagePaths(average, domain, box, days.length)} />
      {head ? <AverageHead x={head.x} y={head.y} /> : null}
      <AxisLabels
        y={height - 8}
        labels={[
          { x: box.left, text: dayLabel(days[0].at), anchor: 'start' },
          ...bands.slice(0, 1).map((band, index) => ({
            x: band.x + band.width / 2,
            text: strings.stale.affectedRange(dayLabel(gaps[index].from), dayLabel(gaps[index].to)),
            anchor: 'middle' as const,
            warn: true,
          })),
          { x: box.right, text: dayLabel(days[days.length - 1].at), anchor: 'end' },
        ]}
      />
    </ChartFrame>
  );
}

/**
 * Weight and waist on one time axis, which is screen 04's body card.
 *
 * They share the axis rather than the scale, because kilograms and centimetres
 * have no common zero and stacking them on one value scale would be a chart
 * that looks like a comparison and is not one. What sharing the axis buys is
 * the thing the owner is actually after: the gap of four days cuts through both
 * bands in the same place, and a waist that fell while the scale did not is
 * read at a glance.
 */
export function BodyChart({
  id,
  days,
  waistDays,
  goal,
  unit,
  waistUnit,
  height = 212,
}: {
  id: string;
  days: Day[];
  waistDays: Day[];
  goal: Goal | null;
  unit: string;
  waistUnit: string;
  height?: number;
}) {
  const weightBox = { left: 8, right: 321, top: 14, bottom: 118 };
  const waistBox = { left: 8, right: 321, top: 148, bottom: 192 };
  const average = rollingAverage(days);
  const gaps = findGaps(days);
  const bands = gapBands(gaps, days.length, weightBox);

  const firstDay = dayAsDate(days[0].at);
  const lastDay = dayAsDate(days[days.length - 1].at);
  const goalAt = goal
    ? [goalValueOn(goal, firstDay), goalValueOn(goal, lastDay)].filter(
        (value): value is number => value !== null,
      )
    : [];
  const domain = wholeDomain([
    ...days.flatMap((day) => (day.reading ? [day.reading.value] : [])),
    ...average.flatMap((point) => (point.value === null ? [] : [point.value])),
    ...goalAt.flatMap((value) => [value + GOAL_CORRIDOR, value - GOAL_CORRIDOR]),
  ]);
  const waistDomain = wholeDomain(
    waistDays.flatMap((day) => (day.reading ? [day.reading.value] : [])),
    0.8,
  );

  const geometry = goal ? goalGeometry(goal, firstDay, lastDay, domain, weightBox) : null;
  const head = averageHead(average, domain, weightBox, days.length);
  const waist = linePath(waistDays, waistDomain, waistBox);
  const unitWord = strings.units[unit as keyof typeof strings.units] ?? unit;
  const waistUnitWord = strings.units[waistUnit as keyof typeof strings.units] ?? waistUnit;

  return (
    <>
      <ChartFrame
        id={id}
        height={height}
        title={strings.trend.bodyTitle(days.length)}
        desc={strings.trend.bodyDesc}
        caption={strings.trend.captionWeight}
        rows={tableRows(days, unit)}
      >
        {/*
          * The band's name sits on the right, where no gridline label lives.
          * On the left it landed on top of the topmost kilogram label.
          */}
        <text x={weightBox.right} y="8" textAnchor="end" className="axis">
          {strings.metrics.weight} {unitWord}
        </text>
        {geometry ? <Corridor corridor={geometry.corridor} /> : null}
        <GridLines lines={gridLines(domain, weightBox, 3)} unit={unit} box={weightBox} />
        <Hatch id={id} bands={bands} top={weightBox.top} bottom={weightBox.bottom} />
        {geometry ? <GoalTrajectory line={geometry.line} /> : null}
        <DailyDots dots={dotsOf(days, domain, weightBox)} href={valueHref} />
        <AverageLine segments={averagePaths(average, domain, weightBox, days.length)} />
        {head ? <AverageHead x={head.x} y={head.y} /> : null}

        <line x1={weightBox.left} y1="128" x2={weightBox.right} y2="128" stroke="var(--line)" strokeWidth="1" />
        <text x={waistBox.right} y="140" textAnchor="end" className="axis">
          {strings.metrics.waist} {waistUnitWord}
        </text>
        {/*
          * The same gap, cut through the waist band in the same place. The
          * waist readings themselves are weekly and by hand, so a week between
          * two of them is not a gap; what is drawn here is the range where the
          * scale went silent, because that is the range where nothing about the
          * body was measured at all.
          */}
        <Hatch
          id={id}
          bands={gapBands(gaps, days.length, waistBox)}
          top={waistBox.top}
          bottom={waistBox.bottom}
          rule={false}
        />
        <SeriesLine path={waist.path} dots={waist.dots} href={valueHref} />
        <AxisLabels
          y={height - 4}
          labels={[
            { x: weightBox.left, text: dayLabel(days[0].at), anchor: 'start' },
            ...bands.slice(0, 1).map((band, index) => ({
              x: band.x + band.width / 2,
              text: strings.stale.affectedRange(
                dayLabel(gaps[index].from),
                dayLabel(gaps[index].to),
              ),
              anchor: 'middle' as const,
              warn: true,
            })),
            { x: weightBox.right, text: dayLabel(days[days.length - 1].at), anchor: 'end' },
          ]}
        />
      </ChartFrame>
      {/*
        * The waist rows, as their own table. One chart, two series, two tables:
        * a reader who cannot see the chart needs the waist dates and numbers as
        * plainly as the weight ones, and interleaving two units in one table
        * would be the summary string this rubric line exists to refuse.
        */}
      <ChartTable
        id={`${id}-waist`}
        caption={strings.trend.captionWaist}
        rows={tableRows(waistDays, waistUnit)}
      />
    </>
  );
}

/**
 * The waist sparkline on Today. Small, connected, and on its own scale.
 *
 * Connected on purpose, where the daily weight readings are not. A tape measure
 * is used about once a week by one person in one place, so two consecutive
 * readings really are two comparable measurements of the same thing; two
 * consecutive scale readings are two hydration states. The rule is not "never
 * join dots", it is "never join dots that are not comparable".
 */
export function WaistChart({
  id,
  days,
  unit,
  height = 64,
}: {
  id: string;
  days: Day[];
  unit: string;
  height?: number;
}) {
  const box = boxOf(height);
  const domain = wholeDomain(
    days.flatMap((day) => (day.reading ? [day.reading.value] : [])),
    0.8,
  );
  const line = linePath(days, domain, box);
  const first = days.find((day) => day.reading);
  const last = [...days].reverse().find((day) => day.reading);
  const unitWord = strings.units[unit as keyof typeof strings.units] ?? unit;
  return (
    <ChartFrame
      id={id}
      height={height}
      title={strings.trend.waistTitle(days.length)}
      desc={strings.trend.waistDesc}
      caption={strings.trend.captionWaist}
      rows={tableRows(days, unit)}
    >
      <SeriesLine path={line.path} dots={line.dots} href={valueHref} />
      <AxisLabels
        y={height - 6}
        labels={[
          ...(first?.reading
            ? [
                {
                  x: box.left,
                  text: `${dayLabel(first.at)}, ${formatNumber(first.reading.value, unit)} ${unitWord}`,
                  anchor: 'start' as const,
                },
              ]
            : []),
          ...(last?.reading
            ? [
                {
                  x: box.right,
                  text: `${dayLabel(last.at)}, ${formatNumber(last.reading.value, unit)} ${unitWord}`,
                  anchor: 'end' as const,
                },
              ]
            : []),
        ]}
      />
    </ChartFrame>
  );
}

export { valueHref, tableRows };
