import { AxisLabels, ChartFrame, type ChartRow, SeriesLine } from '@/components/Chart';
import { boxOf, columnX, scaleY, wholeDomain, type Dot } from '@/lib/chart';
import { analyteLabel, referenceLine, unitSymbol } from '@/lib/lab-display';
import { sourceLabel } from '@/lib/display';
import { formatNumber, shortDate } from '@/lib/format';
import type { Analyte } from '@/lib/labs';
import { strings } from '@/lib/strings';

/**
 * One analyte's trend: every stored panel, as a point, in sample order.
 *
 * A PANEL IS A POINT AND NOT A DAY. The body charts on Health draw a daily
 * series with a hatched band across the days the scale went quiet, and that is
 * right for a thing measured every morning. A blood panel happens twice a year.
 * Rendering it on a daily axis would draw two dots at the ends of a mostly empty
 * chart with three hundred hatched days between them, which says "your data is
 * missing" about a panel nobody was expecting to have.
 *
 * So the axis is the panels themselves, in order, with the sample date under the
 * first and the last. Nothing is interpolated and nothing is carried forward:
 * the line joins two panels because those two panels are the two comparable
 * measurements that exist, which is the same rule the waist chart already
 * follows and DESIGN.md's reason for drawing it joined.
 *
 * A single stored panel draws one dot and no line, which is honest and is what
 * the geometry produces on its own: `linePath` over one point has no segment.
 */

export type AnalyteReading = {
  id: string;
  at: Date;
  value: number;
  unit: string;
  source: string;
  seed: boolean;
};

const HEIGHT = 76;

export function LabTrend({
  id,
  analyte,
  readings,
  timeZone,
}: {
  id: string;
  analyte: Analyte;
  readings: AnalyteReading[];
  timeZone: string;
}) {
  const name = analyteLabel(analyte);
  const box = boxOf(HEIGHT);
  const domain = wholeDomain(readings.map((reading) => reading.value));
  const dots: Dot[] = readings.map((reading, index) => ({
    x: columnX(index, Math.max(readings.length, 2), box),
    y: scaleY(reading.value, domain, box),
    id: reading.id,
    at: reading.at.toISOString(),
    value: reading.value,
  }));
  const path =
    dots.length < 2
      ? ''
      : dots.map((dot, index) => `${index === 0 ? 'M' : 'L'}${dot.x} ${dot.y}`).join(' ');

  const rows: ChartRow[] = readings.map((reading) => ({
    at: reading.at.toISOString(),
    when: shortDate(reading.at, timeZone),
    value: `${formatNumber(reading.value, reading.unit)} ${unitSymbol(reading.unit)}`,
    source: sourceLabel(reading.source),
  }));

  const reference = referenceLine(analyte.referenceLow, analyte.referenceHigh, analyte.unit);
  const latest = readings[readings.length - 1];

  return (
    <section className="card" data-card="analyte" data-analyte={analyte.key}>
      <div className="between">
        <span className="lbl">{name}</span>
        <span className="note num">{reference ?? strings.labs.referenceNone}</span>
      </div>
      <div className="between" style={{ alignItems: 'flex-end', margin: '8px 0 10px' }}>
        <div className="stack">
          <span className="metric">
            {formatNumber(latest.value, latest.unit)} <small>{unitSymbol(latest.unit)}</small>
          </span>
          <span className="note num">{shortDate(latest.at, timeZone)}</span>
        </div>
      </div>
      <ChartFrame
        id={id}
        height={HEIGHT}
        title={strings.labs.trendTitle(name)}
        desc={strings.labs.trendDesc}
        caption={strings.labs.trendCaption(name)}
        rows={rows}
      >
        <SeriesLine path={path} dots={dots} href={(value) => `/value/${value}`} />
        <AxisLabels
          y={HEIGHT - 8}
          labels={[
            { x: box.left, text: shortDate(readings[0].at, timeZone), anchor: 'start' },
            {
              x: box.right,
              text: shortDate(readings[readings.length - 1].at, timeZone),
              anchor: 'end',
            },
          ]}
        />
      </ChartFrame>
    </section>
  );
}
