import type { AiRates } from '@/lib/ai/mode';

/**
 * What a call costs, and whether it is allowed to happen at all.
 *
 * THE ARITHMETIC IS HERE AND THE PRICES ARE NOT. Both rates arrive from the
 * environment, so this file is true whatever Anthropic charges and stays true
 * when the introductory pricing ends on 2026-08-31. A rate this build invented
 * would make every number below a confident fiction.
 *
 * THE CEILING IS CHECKED AGAINST THE WORST CASE, NOT THE LIKELY ONE. F98 says
 * the call is refused when month-to-date plus the pre-flight count would cross
 * the ceiling, and the honest pre-flight figure is the most this call could
 * cost: the input tokens the count endpoint reports, priced, plus the whole
 * output budget, priced. A ceiling checked against an average is a ceiling that
 * is crossed roughly half the time.
 */

const PER_MILLION = 1_000_000;

/** US dollars, or null when the rate table is not configured. */
export function costUsd(
  inputTokens: number,
  outputTokens: number,
  rates: AiRates,
): number | null {
  if (rates.inputPerMTok === null || rates.outputPerMTok === null) return null;
  return (
    (inputTokens * rates.inputPerMTok) / PER_MILLION +
    (outputTokens * rates.outputPerMTok) / PER_MILLION
  );
}

/** The most this call could cost, before it is made. */
export function preflightCostUsd(
  inputTokens: number,
  maxOutputTokens: number,
  rates: AiRates,
): number | null {
  return costUsd(inputTokens, maxOutputTokens, rates);
}

export type CeilingVerdict =
  | { allowed: true; preflightUsd: number; monthToDateUsd: number; capUsd: number }
  | {
      allowed: false;
      reason: 'no_rates' | 'over_ceiling';
      preflightUsd: number | null;
      monthToDateUsd: number;
      capUsd: number;
    };

/**
 * The one decision, in one place.
 *
 * `no_rates` refuses as firmly as `over_ceiling` does, and that is deliberate.
 * A ceiling that cannot price the call it is about to allow is not a ceiling,
 * and spending money this product cannot count is the exact failure F98 exists
 * to stop. The operator screen names the missing value, so the fix is one line
 * in the environment file rather than a mystery.
 */
export function checkCeiling(input: {
  monthToDateUsd: number;
  inputTokens: number;
  maxOutputTokens: number;
  capUsd: number;
  rates: AiRates;
}): CeilingVerdict {
  const preflightUsd = preflightCostUsd(input.inputTokens, input.maxOutputTokens, input.rates);
  if (preflightUsd === null) {
    return {
      allowed: false,
      reason: 'no_rates',
      preflightUsd: null,
      monthToDateUsd: input.monthToDateUsd,
      capUsd: input.capUsd,
    };
  }
  if (input.monthToDateUsd + preflightUsd > input.capUsd) {
    return {
      allowed: false,
      reason: 'over_ceiling',
      preflightUsd,
      monthToDateUsd: input.monthToDateUsd,
      capUsd: input.capUsd,
    };
  }
  return {
    allowed: true,
    preflightUsd,
    monthToDateUsd: input.monthToDateUsd,
    capUsd: input.capUsd,
  };
}

/**
 * Money, as a person reads it, to the cent it is actually charged in.
 *
 * Four decimal places on the cost of one call, because one photograph costs
 * fractions of a cent and rounding it to two would print 0.00 for every call
 * this product makes and 0.00 for a month of them. Two decimal places on the
 * month, because that is a figure with cents in it.
 */
export function usdText(amount: number, places: 2 | 4 = 2): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).format(amount);
}
