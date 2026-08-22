import { AxisLabels, Bars, ChartFrame, type ChartRow, Hatch, SeriesLine } from '@/components/Chart';
import { type Band, type Box, barsOf, boxOf, linePath, trailingBand, wholeDomain } from '@/lib/chart';
import { sourceLabel } from '@/lib/display';
import { dayLabel, formatNumber } from '@/lib/format';
import { strings } from '@/lib/strings';
import type { Day } from '@/lib/trend';

/**
 * The silence at the end of a series, as nought or one band. A list rather than
 * a value, so the hatch takes the same shape here as it does for a gap in the
 * middle of a series and absence has one way of being drawn instead of two.
 */
function trailingBandOf(days: Day[], box: Box): Band[] {
  const band = trailingBand(days, box);
  return band ? [band] : [];
}

/**
 * Steps, sleep and resting heart rate.
 *
 * All three come from the same phone and all three go quiet together, so all
 * three draw silence the same way: the range from the last sample to now is
 * hatched, and no bar of zero is ever drawn for a day the phone did not send.
 * A zero step count is a day in bed and a missing step count is a dead
 * shortcut, and a chart that renders them identically is lying about one of
 * them.
 */

const valueHref = (id: string) => `/value/${id}`;

function rowsOf(days: Day[], unit: string, render: (value: number) => string): ChartRow[] {
  return days.map((day) => ({
    at: day.at,
    when: dayLabel(day.at),
    value: day.reading ? render(day.reading.value) : null,
    source: day.reading ? sourceLabel(day.reading.origin) : null,
  }));
}

function unitWord(unit: string): string {
  return strings.units[unit as keyof typeof strings.units] ?? unit;
}

export function StepsChart({ id, days, height = 76 }: { id: string; days: Day[]; height?: number }) {
  const box = boxOf(height);
  const domain = { low: 0, high: wholeDomain(days.flatMap((day) => (day.reading ? [day.reading.value] : []))).high };
  const trailing = trailingBandOf(days, box);
  return (
    <ChartFrame
      id={id}
      height={height}
      title={strings.trend.activityTitle(days.length)}
      desc={strings.trend.activityDesc}
      caption={strings.trend.captionSteps}
      rows={rowsOf(days, 'step', (value) => `${formatNumber(value, 'step')} ${unitWord('step')}`)}
    >
      <Bars bars={barsOf(days, domain, box)} href={valueHref} baseline={box.bottom} box={box} />
      <Hatch
        id={id}
        bands={trailing}
        top={box.top}
        bottom={box.bottom}
        rule={false}
        label={strings.stale.noData}
      />
      <AxisLabels
        y={height - 8}
        labels={[
          { x: box.left, text: dayLabel(days[0].at), anchor: 'start' },
          { x: box.right, text: dayLabel(days[days.length - 1].at), anchor: 'end' },
        ]}
      />
    </ChartFrame>
  );
}

export function SleepChart({
  id,
  days,
  render,
  height = 76,
}: {
  id: string;
  days: Day[];
  render: (minutes: number) => string;
  height?: number;
}) {
  const box = boxOf(height);
  const domain = { low: 0, high: wholeDomain(days.flatMap((day) => (day.reading ? [day.reading.value] : []))).high };
  const trailing = trailingBandOf(days, box);
  return (
    <ChartFrame
      id={id}
      height={height}
      title={strings.trend.sleepTitle(days.length)}
      desc={strings.trend.sleepDesc}
      caption={strings.trend.captionSleep}
      rows={rowsOf(days, 'min', render)}
    >
      <Bars bars={barsOf(days, domain, box)} href={valueHref} baseline={box.bottom} box={box} />
      <Hatch
        id={id}
        bands={trailing}
        top={box.top}
        bottom={box.bottom}
        rule={false}
        label={strings.stale.noData}
      />
      <AxisLabels
        y={height - 8}
        labels={[
          { x: box.left, text: dayLabel(days[0].at), anchor: 'start' },
          { x: box.right, text: dayLabel(days[days.length - 1].at), anchor: 'end' },
        ]}
      />
    </ChartFrame>
  );
}

export function HeartChart({ id, days, height = 76 }: { id: string; days: Day[]; height?: number }) {
  const box = boxOf(height);
  const domain = wholeDomain(days.flatMap((day) => (day.reading ? [day.reading.value] : [])), 1.4);
  const trailing = trailingBandOf(days, box);
  const line = linePath(days, domain, box);
  return (
    <ChartFrame
      id={id}
      height={height}
      title={strings.trend.heartTitle(days.length)}
      desc={strings.trend.heartDesc}
      caption={strings.trend.captionHeart}
      rows={rowsOf(days, 'bpm', (value) => `${formatNumber(value, 'bpm')} ${unitWord('bpm')}`)}
    >
      <SeriesLine path={line.path} dots={line.dots} href={valueHref} />
      <Hatch
        id={id}
        bands={trailing}
        top={box.top}
        bottom={box.bottom}
        rule={false}
        label={strings.stale.noData}
      />
      <AxisLabels
        y={height - 8}
        labels={[
          { x: box.left, text: dayLabel(days[0].at), anchor: 'start' },
          { x: box.right, text: dayLabel(days[days.length - 1].at), anchor: 'end' },
        ]}
      />
    </ChartFrame>
  );
}
