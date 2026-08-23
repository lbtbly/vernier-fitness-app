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
}: {
  macros: MacroSet;
  precision?: EnergyPrecision;
  /** The one-letter heads a day total uses, where four labels share one line. */
  short?: boolean;
}) {
  const cells: { label: string; value: number | null }[] = [
    { label: short ? strings.nutrition.proteinShort : strings.nutrition.protein, value: macros.proteinG },
    { label: short ? strings.nutrition.carbohydrateShort : strings.nutrition.carbohydrate, value: macros.carbG },
    { label: short ? strings.nutrition.fatShort : strings.nutrition.fat, value: macros.fatG },
    { label: strings.nutrition.fibre, value: macros.fibreG },
  ];
  return (
    <div className="macro" data-macros="true">
      {cells.map((cell) => (
        <span key={cell.label} data-macro={cell.label}>
          {cell.label}{' '}
          {cell.value === null ? (
            <span className="unknown" data-unknown="true">
              {strings.nutrition.unknown}
            </span>
          ) : (
            <b>
              {macroText(roundMacro(cell.value, precision))} {strings.units.g}
            </b>
          )}
        </span>
      ))}
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
