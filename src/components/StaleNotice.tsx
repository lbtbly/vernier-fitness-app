import { ChevronIcon, ScaleIcon, WarnIcon, WaveIcon } from '@/components/icons';
import type { SourceFreshness } from '@/db/trends';
import { sourceLabel } from '@/lib/display';
import { shortDateTime } from '@/lib/format';
import { strings } from '@/lib/strings';

/**
 * A source that has gone quiet, named.
 *
 * The panel's first finding was that silence is the failure mode: nobody churns
 * on a missing feature, they churn on the app failing to do something without
 * saying so. The operator found a dead Withings token by noticing a flat gap in
 * a chart four days later, which is the worst possible signal because he was
 * not looking for it. So a source past 36 hours gets a warn chip carrying its
 * age in hours, a sentence naming what actually stopped, and a hatched range on
 * every chart it feeds. Three signals, one silence, none of them a modal.
 */

const ICONS: Record<string, typeof ScaleIcon> = {
  withings: ScaleIcon,
  apple_health_shortcut: WaveIcon,
};

/** Under two days the age is hours, because 36 falls inside a day boundary. */
const HOURS_UNTIL_DAYS = 48;

export function staleAge(freshness: SourceFreshness): string {
  const label = sourceLabel(freshness.source);
  const hours = freshness.hours ?? 0;
  if (hours < HOURS_UNTIL_DAYS) return strings.stale.hours(label, hours);
  return strings.provenance.staleLabel(label, Math.floor(hours / 24));
}

/** What stopped, in words, and never a status code on its own. */
export function staleCause(freshness: SourceFreshness, timeZone: string): string {
  if (!freshness.lastAt) return strings.stale.notConnected(sourceLabel(freshness.source));
  const when = shortDateTime(freshness.lastAt, timeZone);
  return freshness.source === 'withings'
    ? strings.stale.scaleCause(when)
    : strings.stale.shortcutCause(when);
}

/** The chip: the age, in the warn treatment, beside the card it belongs to. */
export function StaleChip({ freshness }: { freshness: SourceFreshness }) {
  const Icon = ICONS[freshness.source] ?? WarnIcon;
  return (
    <span className="src stale" data-stale={freshness.source}>
      <Icon />
      {staleAge(freshness)}
    </span>
  );
}

/** The cause, drawn under the chip so age and reason are read as one thing. */
export function StaleCause({
  freshness,
  timeZone,
}: {
  freshness: SourceFreshness;
  timeZone: string;
}) {
  return (
    <p className="note warn" data-stale-cause={freshness.source}>
      {staleCause(freshness, timeZone)}
    </p>
  );
}

/**
 * The banner Today carries under its title. One row, a count, no modal.
 *
 * IT USED TO DRAW A LINE PER QUIET SOURCE, AND ITS HEIGHT WAS THEREFORE DATA.
 * Two lines instead of one added 41 px, which put the weight trend 26 to 27 px
 * under F27's 715 px fold on about one day in six, and five quiet sources would
 * have added twice that again. A banner that fits only while at most one source
 * is silent does not fit a product with five of them, and silence is the whole
 * failure mode, so the answer is not to draw fewer warnings.
 *
 * So it collapses. One line, always, naming how many sources have stopped, in
 * the warn treatment, above the fold. Every age and every cause is one tap
 * below it in a native disclosure, and none of it was moved off the screen:
 * each source also keeps its own warn chip, its own cause sentence and its own
 * hatched range in the card it feeds, which is what DESIGN.md section 4 defines
 * the stale state as. This is the same shape the offline banner already ships
 * in: one line under the title carrying a count.
 */
export function StaleBanner({
  freshness,
  timeZone,
}: {
  freshness: SourceFreshness[];
  timeZone: string;
}) {
  const quiet = freshness.filter((source) => source.stale);
  if (quiet.length === 0) return null;
  return (
    <details className="banner w" data-stale-banner={quiet.length}>
      <summary data-stale-summary={quiet.length}>
        <WarnIcon />
        <b className="grow">{strings.stale.bannerSummary(quiet.length)}</b>
        <ChevronIcon className="ch" />
      </summary>
      <div className="stalelines">
        {quiet.map((source) => (
          <span key={source.source} className="staleline" data-stale-line={source.source}>
            {strings.stale.banner(staleAge(source), staleCause(source, timeZone))}
          </span>
        ))}
      </div>
    </details>
  );
}
