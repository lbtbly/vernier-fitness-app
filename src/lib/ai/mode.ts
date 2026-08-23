/**
 * Which Anthropic this installation talks to, what it is allowed to spend, and
 * what a token costs.
 *
 * Read on every call and never cached at module load, for the reason
 * `src/lib/config.ts` and `src/lib/withings/mode.ts` both give: configuration is
 * a runtime value, and a cached one survives the restart that was meant to
 * change it.
 *
 * NOTHING HERE IS WRITTEN FROM MEMORY. The model identifier is
 * `ANTHROPIC_MODEL` and there is no default in this file, because a model id
 * compiled into a build is a snapshot that retires while the source still says
 * it is current. The rate table is two environment values for the same reason
 * and because `.forge/PLAN.md` says it in as many words: "the rate table lives
 * in config, not code". Sonnet 5 introductory pricing ends 2026-08-31, so a
 * price constant in this file would be wrong before the year is out and wrong
 * silently, which is the expensive way to be wrong about money.
 *
 * With no rate configured, a live call is refused rather than made. A ceiling
 * that cannot price a call cannot enforce itself, and spending money you cannot
 * count is exactly what F98 exists to stop.
 */

export type AiMode = 'demo' | 'live';

export type AiRates = {
  /** US dollars per million input tokens, as the pricing page states it. */
  inputPerMTok: number | null;
  outputPerMTok: number | null;
};

export type AiSettings = {
  mode: AiMode;
  apiKey: string;
  model: string;
  monthlyCapUsd: number;
  maxOutputTokens: number;
  rates: AiRates;
  /** True when the environment names a mode explicitly rather than being read. */
  declared: boolean;
};

/**
 * The default output budget for one reply, in tokens.
 *
 * This is a choice this product makes about its own prompt, not a fact about
 * the API, so it is allowed to have a value here. It is the number the ceiling
 * prices as the worst case an unfinished call could cost.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

/** The ceiling used when the environment names none. `.env.example` says 10. */
export const DEFAULT_MONTHLY_CAP_USD = 10;

function trimmed(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function positiveNumber(name: string): number | null {
  const raw = trimmed(name);
  if (raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * Demonstration unless there is a key to use.
 *
 * `ANTHROPIC_MODE` wins when it is set, so an owner who has entered his key can
 * still run the demonstration path on purpose, which is what F95 is graded on.
 * With nothing declared, a blank key means demonstration: an installation with
 * no credential must not sit in a live mode that fails every call, because "not
 * connected" and "connected and broken" are different sentences on screen and
 * the owner acts differently on each.
 */
export function readAiSettings(): AiSettings {
  const declaredMode = trimmed('ANTHROPIC_MODE').toLowerCase();
  const apiKey = trimmed('ANTHROPIC_API_KEY');
  const mode: AiMode =
    declaredMode === 'live'
      ? 'live'
      : declaredMode === 'demo'
        ? 'demo'
        : apiKey === ''
          ? 'demo'
          : 'live';

  return {
    mode,
    apiKey,
    model: trimmed('ANTHROPIC_MODEL'),
    monthlyCapUsd: positiveNumber('ANTHROPIC_MONTHLY_CAP_USD') ?? DEFAULT_MONTHLY_CAP_USD,
    maxOutputTokens: positiveNumber('ANTHROPIC_MAX_OUTPUT_TOKENS') ?? DEFAULT_MAX_OUTPUT_TOKENS,
    rates: {
      inputPerMTok: positiveNumber('ANTHROPIC_INPUT_USD_PER_MTOK'),
      outputPerMTok: positiveNumber('ANTHROPIC_OUTPUT_USD_PER_MTOK'),
    },
    declared: declaredMode === 'live' || declaredMode === 'demo',
  };
}

/** True when the live mode is selected but the key it needs is not there. */
export function liveModeIsUnusable(settings: AiSettings): boolean {
  return settings.mode === 'live' && settings.apiKey === '';
}

/** True when a live call could be priced. A call that cannot be priced is refused. */
export function ratesArePresent(settings: AiSettings): boolean {
  return settings.rates.inputPerMTok !== null && settings.rates.outputPerMTok !== null;
}

/** The month a spend is counted against, in the app's own zone. "2026-08". */
export function monthKey(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(at);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  return `${year}-${month}`;
}
