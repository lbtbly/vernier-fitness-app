import { DocIcon, HandIcon, ScaleIcon, SparkIcon, SyncIcon, WaveIcon } from '@/components/icons';
import { sourceLabel } from '@/lib/display';
import { strings } from '@/lib/strings';

/**
 * The source chip, from .forge/wireframes/00-patterns.html.
 *
 * Every value on screen carries one, permanently, and it is neutral chrome:
 * 22 px, `--surface-2` on `--line-2`, never a semantic colour, because origin
 * is not a state and colour in this product means something needs attention.
 * An estimate is the same chip with a dashed border and a demonstration row a
 * dotted one. A stale source is the one exception, and it earns `--warn`
 * because an origin that stopped sending days ago is exactly the silence the
 * panel named as the failure mode.
 */

const ICONS: Record<string, typeof ScaleIcon> = {
  withings: ScaleIcon,
  apple_health_shortcut: WaveIcon,
  manual: HandIcon,
  lab_pdf: DocIcon,
  derived: SyncIcon,
  demo: SparkIcon,
};

export function SourceChip({
  source,
  confidence,
  staleDays,
  seed,
}: {
  source: string;
  confidence?: string;
  staleDays?: number;
  /**
   * True when the row behind this chip came from the demonstration seed.
   *
   * The chip still names the origin the row stands in for, because that is what
   * the card is about and what a staleness calculation counts against, and the
   * dotted border is what says it was not measured. DESIGN.md is explicit that
   * origin never spends a semantic colour, so a demonstration Withings reading
   * is a Withings chip with a dotted edge and not a coloured one.
   */
  seed?: boolean;
}) {
  const Icon = ICONS[source] ?? SparkIcon;
  const stale = typeof staleDays === 'number' && staleDays > 0;
  const classes = ['src'];
  if (confidence === 'estimated') classes.push('est');
  if (source === 'demo' || seed) classes.push('demo');
  if (stale) classes.push('stale');

  return (
    <span className={classes.join(' ')}>
      <Icon />
      {stale
        ? strings.provenance.staleLabel(sourceLabel(source), staleDays)
        : sourceLabel(source)}
    </span>
  );
}
