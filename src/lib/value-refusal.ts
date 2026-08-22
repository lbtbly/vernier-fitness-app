import { METRICS, checkValue } from '@/lib/provenance';
import { strings } from '@/lib/strings';

/**
 * A refused value, in the owner's words, from the one rule that refuses it.
 *
 * `src/lib/provenance.ts` decides what Vernier will store and says so as a case
 * rather than as a sentence, because it has to stay importable by a plain Node
 * script and because C6 wants every user-facing string to have one home. This
 * is where the case becomes the sentence, and there is one of these so the
 * quick log and the route cannot disagree about why a value was refused.
 *
 * IT RUNS ON THE PHONE TOO, AND THAT IS THE POINT. The quick log commits to
 * IndexedDB first and uploads later, so a value it accepts is reported to the
 * owner as safe the instant he taps Save. With the origin unreachable the
 * sheet's snapshot read fails, the waist stepper had no base, and one tap on
 * the plus control queued a waist measurement of 0.5 cm: the just-logged card
 * said "Waist 0.5 cm, Queued" beside "Still on this phone" for a value the band
 * in provenance.ts refuses at 30 cm and the flush was certain to reject. The
 * data was safe and the message was a lie. The queue asks this function before
 * it accepts anything, so a value the server will refuse is refused at the
 * moment it is typed, with the reason the server would have given.
 */
export type ValueCheck = { ok: true; value: number | null } | { ok: false; detail: string };

export function validateValue(entry: { metric: string; rawValue: string }): ValueCheck {
  const checked = checkValue(entry.metric, entry.rawValue);
  if (checked.ok) return { ok: true, value: checked.value };
  const line = strings.api.log;
  switch (checked.problem) {
    case 'unknownMetric':
      return { ok: false, detail: line.unknownMetric(entry.metric) };
    case 'blank':
      return { ok: false, detail: line.blank };
    case 'notANumber':
      return { ok: false, detail: line.notANumber(entry.rawValue.trim()) };
    case 'rating':
      return { ok: false, detail: line.outOfRange(checked.low, checked.high) };
    case 'range':
      return {
        ok: false,
        detail: line.outOfBand(
          strings.metrics[entry.metric as keyof typeof strings.metrics],
          String(checked.low),
          String(checked.high),
          strings.units[METRICS[entry.metric as keyof typeof METRICS].unit],
        ),
      };
  }
}
