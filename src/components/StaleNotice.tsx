import type { Notice } from '@/components/Notices';
import { ScaleIcon, WarnIcon, WaveIcon } from '@/components/icons';
import type { SourceFreshness } from '@/db/trends';
import { sourceLabel, withingsCauseLine } from '@/lib/display';
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

/**
 * What stopped, in words, and never a status code on its own.
 *
 * F43 asks that a Withings adapter nobody can reach be named BY CAUSE, and "the
 * scale last synced on Friday" is an age wearing a cause's clothes: it says
 * when the silence started and nothing about why. The connection records the
 * reason as a token, `src/lib/display.ts` finds the sentence for it, and the
 * age still follows on the same line. With no recorded cause the age is all
 * there is to say, and saying only that is honest.
 */
export function staleCause(freshness: SourceFreshness, timeZone: string): string {
  const cause = freshness.source === 'withings' ? withingsCauseLine(freshness.lastError) : null;
  if (!freshness.lastAt) {
    return cause ?? strings.stale.notConnected(sourceLabel(freshness.source));
  }
  const when = shortDateTime(freshness.lastAt, timeZone);
  if (freshness.source === 'withings') {
    return cause ? strings.stale.scaleCauseWith(cause, when) : strings.stale.scaleCause(when);
  }
  return strings.stale.shortcutCause(when);
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
 * The quiet sources, as one notice for the region under Today's title.
 *
 * IT USED TO BE A BANNER OF ITS OWN AND ITS HEIGHT WAS DATA. A line per quiet
 * source added 41 px for the second one, which put the weight trend 27 px under
 * F27's 715 px fold on about one day in six, for ever. That was fixed by
 * collapsing this one banner, and then an open import question raised a second
 * banner beside it and put the trend 43 px under the same fold: the same defect,
 * a different element. So the room is bounded by the region now, in
 * src/components/Notices.tsx, and this function's job is to say what it has to
 * say and let the region decide how much room it gets.
 *
 * Nothing was moved off the screen. The summary names how many sources have
 * stopped, every age and every cause is one tap under it, and each source still
 * carries its own warn chip, its own cause sentence and its own hatched range in
 * the card it feeds, which is what DESIGN.md section 4 defines the stale state
 * as.
 */
export function staleNotice(freshness: SourceFreshness[], timeZone: string): Notice | null {
  const quiet = freshness.filter((source) => source.stale);
  if (quiet.length === 0) return null;
  return {
    id: 'stale',
    tone: 'warn',
    summary: strings.stale.bannerSummary(quiet.length),
    lines: quiet.map((source) => strings.stale.banner(staleAge(source), staleCause(source, timeZone))),
  };
}
