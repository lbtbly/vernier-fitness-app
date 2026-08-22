import {
  AVERAGE_DASH,
  AVERAGE_STROKE,
  type Band,
  type Bar,
  CHART_WIDTH,
  type Corridor,
  DOT_RADIUS,
  type Dot,
  GOAL_DASH,
  GOAL_STROKE,
  GRID_STROKE,
  type GoalLine,
  type GridLine,
  type PathSegment,
  round,
} from '@/lib/chart';
import { strings } from '@/lib/strings';

/**
 * Every chart in Vernier, server-rendered as SVG.
 *
 * No canvas and no chart library. A trend the owner reads in ten seconds must
 * not wait on a JavaScript bundle, and an SVG in the response is a thing a
 * verifier can read a stroke width off. The geometry arrives already computed
 * from `src/lib/chart.ts`; nothing in this file decides what may be drawn.
 *
 * **What a screen reader gets.** The `<svg>` is `role="img"` with a `<title>`
 * and a `<desc>`, which is the summary, and immediately after it sits a
 * visually hidden `<table>` holding one row per date with its value and its
 * source. That table is the point: a chart described only by a summary string
 * tells a blind owner the shape of his data and none of the data, and the rows
 * are what he came for. A day with no reading is a row saying so, never a row
 * saying zero.
 */

export type ChartRow = {
  at: string;
  /** The date as the app renders dates, "21 Aug". */
  when: string;
  /** The value with its unit, or null on a day with nothing in it. */
  value: string | null;
  source: string | null;
};

export function ChartTable({
  id,
  caption,
  rows,
  showSource = true,
}: {
  id: string;
  caption: string;
  rows: ChartRow[];
  showSource?: boolean;
}) {
  /*
   * The wrapper carries the hiding, the table carries the data. A table will
   * not lay out narrower than its own min-content, so `.visually-hidden` on the
   * table itself left a 406 px box in the document and every screen holding a
   * chart scrolled sideways. Clipped from a wrapper, the table is as wide as it
   * likes and still in the accessibility tree, which is the half of this that
   * `display:none` would have thrown away.
   */
  return (
    <div className="visually-hidden" data-chart-table={id}>
      <table id={`${id}-table`}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{strings.trend.columnDate}</th>
            <th scope="col">{strings.trend.columnValue}</th>
            {showSource ? <th scope="col">{strings.trend.columnSource}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.at}>
              <th scope="row">{row.when}</th>
              <td>{row.value ?? strings.trend.noReading}</td>
              {showSource ? <td>{row.source ?? strings.trend.noReading}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartFrame({
  id,
  height,
  title,
  desc,
  caption,
  rows,
  showSource,
  children,
}: {
  id: string;
  height: number;
  title: string;
  desc: string;
  caption: string;
  rows: ChartRow[];
  showSource?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="chartwrap">
      <svg
        className="chart"
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        data-chart={id}
      >
        <title id={`${id}-title`}>{title}</title>
        <desc id={`${id}-desc`}>{desc}</desc>
        <defs>
          {/*
            * The hatch, at 45 degrees, which is how absence is drawn. DESIGN.md
            * fixes the angle and the colour, and the pattern id carries the
            * chart's own name because two charts on one screen with one id
            * silently share whichever definition rendered last.
            */}
          <pattern
            id={`${id}-hatch`}
            width="6"
            height="6"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--warn)" strokeWidth="1.3" opacity="0.4" />
          </pattern>
        </defs>
        {children}
      </svg>
      <ChartTable id={id} caption={caption} rows={rows} showSource={showSource} />
    </div>
  );
}

/** The corridor around the trajectory, plus or minus half a kilogram. */
export function Corridor({ corridor }: { corridor: Corridor }) {
  return <polygon points={corridor.points} fill="var(--chart-band)" />;
}

export function GoalTrajectory({ line }: { line: GoalLine }) {
  return (
    <line
      x1={line.x1}
      y1={line.y1}
      x2={line.x2}
      y2={line.y2}
      stroke="var(--chart-goal)"
      strokeWidth={GOAL_STROKE}
      strokeDasharray={GOAL_DASH}
    />
  );
}

export function GridLines({ lines, unit, box }: { lines: GridLine[]; unit: string; box: { left: number; right: number } }) {
  return (
    <g>
      {lines.map((line) => (
        <g key={line.value}>
          <line
            x1={box.left}
            y1={round(line.y)}
            x2={box.right}
            y2={round(line.y)}
            stroke="var(--chart-grid)"
            strokeWidth={GRID_STROKE}
          />
          <text x={box.left} y={round(line.y) - 3} className="axis">
            {line.value} {unit}
          </text>

        </g>
      ))}
    </g>
  );
}

/**
 * The hatched bands. A run of missing days in the middle of a series and the
 * silence at the end of one are drawn the same way on purpose: both are the
 * product saying it does not know, and neither is ever bridged.
 */
export function Hatch({
  id,
  bands,
  top,
  bottom,
  rule = true,
  label,
}: {
  id: string;
  bands: Band[];
  top: number;
  bottom: number;
  rule?: boolean;
  /**
   * Written inside the band rather than on the axis under it. On the axis it
   * collided with the last date label, and a hatch whose caption is unreadable
   * is a hatch that says nothing.
   */
  label?: string;
}) {
  return (
    <g>
      {bands.map((band) => (
        <g key={`${band.from}-${band.to}`}>
          <rect
            x={round(band.x)}
            y={top}
            width={round(band.width)}
            height={round(bottom - top)}
            fill={`url(#${id}-hatch)`}
          />
          {label && band.width > 30 ? (
            <text
              x={round(band.x + band.width / 2)}
              y={round((top + bottom) / 2)}
              textAnchor="middle"
              className="axis warn"
            >
              {label}
            </text>
          ) : null}
          {rule ? (
            <>
              <line
                x1={round(band.x)}
                y1={top}
                x2={round(band.x)}
                y2={round(bottom)}
                stroke="var(--warn)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.7"
              />
              <line
                x1={round(band.x + band.width)}
                y1={top}
                x2={round(band.x + band.width)}
                y2={round(bottom)}
                stroke="var(--warn)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.7"
              />
            </>
          ) : null}
        </g>
      ))}
    </g>
  );
}

/**
 * The daily readings: 2.1 px dots in the quiet colour, never joined.
 *
 * Joining them would draw a line through hydration, which is the one thing a
 * body-composition trend must not do. Each dot is a link to its own value
 * sheet, so a point walks back to its source in two taps; it is out of the tab
 * order because the reachable-by-keyboard route is the visible row under the
 * chart, and a focus ring on an invisible 2 px circle helps nobody.
 *
 * A plain anchor rather than next/link, deliberately. Inside an svg the element
 * is an SVG anchor and not an HTML one, and a chart that is server-rendered
 * precisely so it needs no bundle should not route through one to open a value
 * sheet.
 */
export function DailyDots({ dots, href }: { dots: Dot[]; href: (id: string) => string }) {
  return (
    <g fill="var(--chart-daily)" data-dots={dots.length}>
      {dots.map((dot) => (
        <a key={dot.id} href={href(dot.id)} tabIndex={-1} data-reading={dot.at}>
          {/* The hit area. Transparent, half a column wide, so a 2.1 px dot can
              actually be tapped with a thumb. */}
          <circle cx={round(dot.x)} cy={round(dot.y)} r="6" fill="transparent" />
          <circle cx={round(dot.x)} cy={round(dot.y)} r={DOT_RADIUS} />
        </a>
      ))}
    </g>
  );
}

/**
 * The rolling average: 2.6 px, round-capped, and the loudest object on the
 * chart. Dashed where its window was short, absent where it was too short to
 * mean anything.
 */
export function AverageLine({ segments }: { segments: PathSegment[] }) {
  return (
    <g data-average-segments={segments.length}>
      {segments.map((segment, index) => (
        <path
          key={`${index}-${segment.d.slice(0, 12)}`}
          d={segment.d}
          fill="none"
          stroke="var(--chart-avg)"
          strokeWidth={AVERAGE_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...(segment.dashed ? { strokeDasharray: AVERAGE_DASH, opacity: 0.75 } : {})}
          data-window={segment.dashed ? 'short' : 'whole'}
        />
      ))}
    </g>
  );
}

export function AverageHead({ x, y }: { x: number; y: number }) {
  return (
    <circle
      cx={round(x)}
      cy={round(y)}
      r="4.4"
      fill="var(--chart-avg)"
      stroke="var(--surface)"
      strokeWidth="2"
    />
  );
}

/** A connected series drawn in the loud colour: waist, resting heart rate. */
export function SeriesLine({
  path,
  dots,
  href,
  width = 2.4,
}: {
  path: string;
  dots: Dot[];
  href: (id: string) => string;
  width?: number;
}) {
  return (
    <g>
      {path === '' ? null : (
        <path
          d={path}
          fill="none"
          stroke="var(--chart-avg)"
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <g fill="var(--chart-avg)" data-points={dots.length}>
        {dots.map((dot, index) => (
          <a key={dot.id} href={href(dot.id)} tabIndex={-1} data-reading={dot.at}>
            <circle cx={round(dot.x)} cy={round(dot.y)} r="7" fill="transparent" />
            <circle
              cx={round(dot.x)}
              cy={round(dot.y)}
              r={index === dots.length - 1 ? 3.8 : 2.6}
              {...(index === dots.length - 1
                ? { stroke: 'var(--surface)', strokeWidth: 1.6 }
                : {})}
            />
          </a>
        ))}
      </g>
    </g>
  );
}

/** One bar per day. A day with nothing in it has no bar, and never a bar of zero. */
export function Bars({ bars, href, baseline, box }: { bars: Bar[]; href: (id: string) => string; baseline: number; box: { left: number; right: number } }) {
  return (
    <g>
      <g fill="var(--chart-daily)" data-bars={bars.length}>
        {bars.map((bar, index) => (
          <a key={bar.id} href={href(bar.id)} tabIndex={-1} data-reading={bar.at}>
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx="3"
              {...(index === bars.length - 1 ? { fill: 'var(--chart-avg)' } : {})}
            />
          </a>
        ))}
      </g>
      <line
        x1={box.left}
        y1={baseline}
        x2={box.right}
        y2={baseline}
        stroke="var(--line)"
        strokeWidth="1"
      />
    </g>
  );
}

export type AxisLabel = { x: number; text: string; anchor: 'start' | 'middle' | 'end'; warn?: boolean };

export function AxisLabels({ labels, y }: { labels: AxisLabel[]; y: number }) {
  return (
    <g>
      {labels.map((label, index) => (
        <text
          key={`${index}-${label.text}`}
          x={round(label.x)}
          y={y}
          textAnchor={label.anchor}
          className={label.warn ? 'axis warn' : 'axis'}
        >
          {label.text}
        </text>
      ))}
    </g>
  );
}

/** The legend, which names the three objects in the order of their loudness. */
export function ChartLegend({
  window,
  goal,
}: {
  window: number;
  goal: { target: string; unit: string } | null;
}) {
  return (
    <div className="legend">
      <span>
        <i className="sw" />
        {strings.trend.legendAverage(window)}
      </span>
      <span>
        <i className="sw daily" />
        {strings.trend.legendDaily}
      </span>
      {goal ? (
        <span>
          <i className="sw goal" />
          {strings.trend.legendGoal(goal.target, goal.unit)}
        </span>
      ) : null}
    </div>
  );
}
