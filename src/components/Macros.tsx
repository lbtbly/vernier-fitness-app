import { energyText, macroText, roundMacro, type EnergyPrecision, type MacroSet } from '@/lib/macros';
import { strings } from '@/lib/strings';

/**
 * The five numbers, drawn the same way everywhere they appear.
 *
 * C12 names them: energy and all four macronutrients including fibre, on every
 * meal row. One component draws that line, so no surface can quietly drop
 * fibre, which is the field every other food table drops and the field this
 * whole data source was chosen for.
 *
 * A NULL RENDERS AS THE WORD AND NEVER AS A ZERO, and it renders in `--text-3`
 * rather than in the value ink, so absence is legible as absence at a glance as
 * well as in words. There is no branch anywhere below that turns a null into a
 * number.
 */

export function MacroLine({
  macros,
  precision = 'computed',
  short = false,
  band = null,
}: {
  macros: MacroSet;
  precision?: EnergyPrecision;
  /** The one-letter heads a day total uses, where four labels share one line. */
  short?: boolean;
  /**
   * The two ends of an estimate, drawn as "44 to 52 g" instead of a number.
   *
   * WHY THIS EXISTS. Screen 09 frame 2 draws all four macronutrients on the
   * totals card as ranges, beside an energy line that is already one. The
   * estimate shipped with the energy as a range and the four macros as bare
   * points off `totals.mid`, which says a photograph produced a weight to the
   * gram. F95 and F96 are about exactly that: an estimate is a range and never
   * a point, and it is a range on every number it states.
   *
   * A BOUND THAT COLLAPSES IS A POINT AGAIN, and that is not a softening. Set
   * an exact weight on every line and the two ends meet, the line stops being
   * an estimate, and printing "50 to 50 g" would be the screen inventing an
   * uncertainty the owner has just removed.
   */
  band?: { low: MacroSet; high: MacroSet } | null;
}) {
  const cells: { label: string; value: number | null; low: number | null; high: number | null }[] = [
    {
      label: short ? strings.nutrition.proteinShort : strings.nutrition.protein,
      value: macros.proteinG,
      low: band?.low.proteinG ?? null,
      high: band?.high.proteinG ?? null,
    },
    {
      label: short ? strings.nutrition.carbohydrateShort : strings.nutrition.carbohydrate,
      value: macros.carbG,
      low: band?.low.carbG ?? null,
      high: band?.high.carbG ?? null,
    },
    {
      label: short ? strings.nutrition.fatShort : strings.nutrition.fat,
      value: macros.fatG,
      low: band?.low.fatG ?? null,
      high: band?.high.fatG ?? null,
    },
    {
      label: strings.nutrition.fibre,
      value: macros.fibreG,
      low: band?.low.fibreG ?? null,
      high: band?.high.fibreG ?? null,
    },
  ];
  return (
    <div className="macro" data-macros="true">
      {cells.map((cell) => {
        const low = cell.low === null ? null : roundMacro(cell.low, precision);
        const high = cell.high === null ? null : roundMacro(cell.high, precision);
        const spread = band !== null && low !== null && high !== null && low !== high;
        return (
          <span key={cell.label} data-macro={cell.label} data-macro-range={spread ? 'true' : 'false'}>
            {cell.label}{' '}
            {cell.value === null ? (
              <span className="unknown" data-unknown="true">
                {strings.nutrition.unknown}
              </span>
            ) : spread ? (
              <b>
                {strings.nutrition.range(macroText(low), macroText(high))} {strings.units.g}
              </b>
            ) : (
              <b>
                {macroText(roundMacro(cell.value, precision))} {strings.units.g}
              </b>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Energy, with its unit, on its own grid. Also renders absence as the word. */
export function EnergyValue({
  kcal,
  precision = 'computed',
}: {
  kcal: number | null;
  precision?: EnergyPrecision;
}) {
  if (kcal === null) {
    return (
      <span className="unknown" data-unknown="true" data-energy="unknown">
        {strings.nutrition.unknown}
      </span>
    );
  }
  return (
    <span className="num" data-energy="true">
      {energyText(kcal, precision)} {strings.units.kcal}
    </span>
  );
}

/** The whole set: energy first, then the four, in the order C12 lists them. */
export function MacroBlock({
  macros,
  precision = 'computed',
}: {
  macros: MacroSet;
  precision?: EnergyPrecision;
}) {
  return (
    <div data-macro-block="true">
      <div className="between">
        <span className="lbl">{strings.nutrition.energy}</span>
        <span className="big num">
          <EnergyValue kcal={macros.kcal} precision={precision} />
        </span>
      </div>
      <div style={{ marginTop: 'var(--s2)' }}>
        <MacroLine macros={macros} precision={precision} />
      </div>
    </div>
  );
}
