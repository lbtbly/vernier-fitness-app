import { checkCeiling } from '@/lib/ai/cost';
import { type AiCategory, type ConsentSet } from '@/lib/ai/consent';
import { type ModelReading, parseModelReading } from '@/lib/ai/estimate';
import { type AiSettings } from '@/lib/ai/mode';
import { photoEstimateRequest } from '@/lib/ai/prompt';
import type { AiFailure, AiTransport } from '@/lib/ai/transport';

/**
 * The mandatory sequence, in the one order it is allowed to happen in.
 *
 * THE ORDER IS THE LINE. Consent, then the pre-flight count, then the ceiling,
 * then the call, then the ledger row in the same transaction as the result,
 * then the parse. Each step can only refuse in a way that leaves the ones after
 * it unreached, and each refusal names itself, so "no request was made" is a
 * property of control flow rather than a claim in a comment.
 *
 * WHY THE PARSE IS LAST AND AFTER THE LEDGER. A reply that came back unreadable
 * still cost money. Recording the spend first and reading the reply second is
 * the difference between a ledger that matches the invoice and one that
 * quietly under-reports every failed parse.
 *
 * The transport is an argument, so a test can assert the thing F94 actually
 * asks for: with a category switched off, the recorder holds zero calls. A test
 * that asserted a disabled button would pass over an implementation that sent
 * the photograph anyway.
 */

export type UsageRecord = {
  purpose: AiCategory;
  mode: 'demo' | 'live';
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  outcome: 'charged' | 'refused_over_ceiling';
  /** The reply as it arrived, or an empty string on a refusal. */
  replyText: string;
};

/** Writes the call and its cost in ONE transaction. F98's middle clause. */
export type UsageRecorder = (record: UsageRecord) => Promise<{ callId: string }>;

export type EstimateRefusal =
  | { reason: 'consent_off' }
  | { reason: 'no_model' }
  | { reason: 'no_rates'; monthToDateUsd: number; capUsd: number }
  | {
      reason: 'over_ceiling';
      monthToDateUsd: number;
      preflightUsd: number;
      capUsd: number;
    }
  | { reason: 'transport'; failure: AiFailure }
  | { reason: 'unreadable'; parse: 'not_json' | 'no_items' | 'bad_item'; callId: string };

export type EstimateOutcome =
  | {
      ok: true;
      reading: ModelReading;
      callId: string;
      mode: 'demo' | 'live';
      model: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  | ({ ok: false } & EstimateRefusal);

export async function runPhotoEstimate(input: {
  settings: AiSettings;
  consent: ConsentSet;
  transport: AiTransport;
  imageBase64: string;
  slotLabel: string;
  monthToDateUsd: number;
  record: UsageRecorder;
}): Promise<EstimateOutcome> {
  /*
   * 1. Consent, above everything, including the token count.
   *
   * F94 is graded on a request log and not on a screen state, so this returns
   * before the transport is touched at all. Not a disabled button, not a
   * guarded fetch in a component: the server refuses, and the only way to reach
   * a socket from here is through a switch the owner turned on himself.
   */
  if (!input.consent.photo_analysis) return { ok: false, reason: 'consent_off' };

  const { settings } = input;
  if (settings.mode === 'live' && settings.model === '') return { ok: false, reason: 'no_model' };

  const request = photoEstimateRequest({
    model: settings.model,
    maxOutputTokens: settings.maxOutputTokens,
    slotLabel: input.slotLabel,
    imageBase64: input.imageBase64,
  });

  /*
   * 2. The pre-flight count. It is a round trip of its own and it is the number
   * the ceiling is checked against, which is why it cannot be an estimate this
   * build computes from the byte length of a JPEG.
   */
  const counted = await input.transport.countTokens(request);
  if (!counted.ok) return { ok: false, reason: 'transport', failure: counted };

  /*
   * 3. The ceiling, against the worst case.
   *
   * A demonstration with no rate table configured prices at zero and runs, so
   * F95's "the whole flow with no key" does not depend on the owner having
   * filled in a pricing page he is not being charged by. A demonstration WITH
   * rates prices notionally, which is what lets the refusal be demonstrated
   * with no key and no money at all. A live call with no rates is refused: a
   * ceiling that cannot price the call it allows is not a ceiling.
   */
  const priced = settings.mode === 'live' || settings.rates.inputPerMTok !== null;
  const verdict = checkCeiling({
    monthToDateUsd: input.monthToDateUsd,
    inputTokens: counted.inputTokens,
    maxOutputTokens: settings.maxOutputTokens,
    capUsd: settings.monthlyCapUsd,
    rates: priced ? settings.rates : { inputPerMTok: 0, outputPerMTok: 0 },
  });

  if (!verdict.allowed) {
    if (verdict.reason === 'no_rates') {
      return {
        ok: false,
        reason: 'no_rates',
        monthToDateUsd: verdict.monthToDateUsd,
        capUsd: verdict.capUsd,
      };
    }
    // The refusal is a row too. An operator reading the ledger has to be able
    // to see that a call was stopped, and on what arithmetic, or the ceiling
    // looks identical to a month in which nothing was attempted.
    await input.record({
      purpose: 'photo_analysis',
      mode: settings.mode,
      model: settings.model,
      inputTokens: counted.inputTokens,
      outputTokens: 0,
      costUsd: 0,
      outcome: 'refused_over_ceiling',
      replyText: '',
    });
    return {
      ok: false,
      reason: 'over_ceiling',
      monthToDateUsd: verdict.monthToDateUsd,
      preflightUsd: verdict.preflightUsd ?? 0,
      capUsd: verdict.capUsd,
    };
  }

  /* 4. The call itself. */
  const reply = await input.transport.send(request);
  if (!reply.ok) return { ok: false, reason: 'transport', failure: reply };

  /* 5. The result and its cost, in one transaction, before anything is read. */
  const spent =
    priced && settings.rates.inputPerMTok !== null && settings.rates.outputPerMTok !== null
      ? (reply.inputTokens * settings.rates.inputPerMTok) / 1_000_000 +
        (reply.outputTokens * settings.rates.outputPerMTok) / 1_000_000
      : 0;

  const { callId } = await input.record({
    purpose: 'photo_analysis',
    mode: settings.mode,
    model: reply.model,
    inputTokens: reply.inputTokens,
    outputTokens: reply.outputTokens,
    costUsd: spent,
    outcome: 'charged',
    replyText: reply.text,
  });

  /* 6. The parse, last, so an unreadable reply is still a paid one. */
  const parsed = parseModelReading(reply.text);
  if (!parsed.ok) {
    return { ok: false, reason: 'unreadable', parse: parsed.reason, callId };
  }

  return {
    ok: true,
    reading: parsed.reading,
    callId,
    mode: settings.mode,
    model: reply.model,
    inputTokens: reply.inputTokens,
    outputTokens: reply.outputTokens,
    costUsd: spent,
  };
}
