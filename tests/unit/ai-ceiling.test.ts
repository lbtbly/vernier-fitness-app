import { describe, expect, test } from 'vitest';
import { checkCeiling, costUsd, preflightCostUsd } from '@/lib/ai/cost';
import { consentOf } from '@/lib/ai/consent';
import { demoAiTransport, DEMO_INPUT_TOKENS } from '@/lib/ai/demo';
import { validateModel } from '@/lib/ai/model-check';
import { type AiSettings, monthKey } from '@/lib/ai/mode';
import { runPhotoEstimate, type UsageRecord } from '@/lib/ai/service';
import { recordingTransport, type AiTransport } from '@/lib/ai/transport';
import { strings } from '@/lib/strings';

/**
 * The monthly ceiling refuses the call, and the model is checked at boot. F98.
 *
 * THREE CLAUSES, THREE BLOCKS. The ceiling is checked against month-to-date
 * plus the PRE-FLIGHT count, so the arithmetic below uses the count endpoint's
 * answer and the whole output budget, which is the most the call could cost. A
 * refusal writes a ledger row and sends nothing. And an identifier the Models
 * API does not know is a named error rather than a shrug.
 *
 * WHAT WOULD MAKE THESE GO RED. Checking the ceiling against the average cost
 * of a call rather than the worst case lets a call through in the third test.
 * Recording the ledger row after the reply is parsed rather than beside it
 * loses the refusal row in the fourth. Treating a 404 from the Models API as a
 * warning fails the last block, which is the whole point of a boot check.
 */

const RATES = { inputPerMTok: 3, outputPerMTok: 15 };

const LIVE: AiSettings = {
  mode: 'live',
  apiKey: 'test-key-not-a-real-one',
  model: 'claude-opus-5',
  monthlyCapUsd: 10,
  maxOutputTokens: 1024,
  rates: RATES,
  declared: true,
};

function recorder() {
  const written: UsageRecord[] = [];
  return {
    written,
    record: async (entry: UsageRecord) => {
      written.push(entry);
      return { callId: `call_${written.length}` };
    },
  };
}

describe('a call is priced before it is made', () => {
  test('the cost is the two token counts at the two configured rates', () => {
    expect(costUsd(1_000_000, 0, RATES)).toBe(3);
    expect(costUsd(0, 1_000_000, RATES)).toBe(15);
    expect(costUsd(2000, 500, RATES)).toBeCloseTo(2000 * 3e-6 + 500 * 15e-6, 10);
  });

  test('with no rate table the cost is unknown rather than zero', () => {
    expect(costUsd(2000, 500, { inputPerMTok: null, outputPerMTok: null })).toBeNull();
  });

  test('the pre-flight figure prices the whole output budget, not an average', () => {
    const preflight = preflightCostUsd(2000, 1024, RATES);
    const likely = costUsd(2000, 200, RATES);
    expect(preflight).not.toBeNull();
    expect(preflight!).toBeGreaterThan(likely!);
  });
});

describe('the ceiling refuses rather than overspending', () => {
  test('month-to-date plus the pre-flight figure crossing the cap is a refusal', () => {
    const verdict = checkCeiling({
      monthToDateUsd: 9.999,
      inputTokens: 2000,
      maxOutputTokens: 1024,
      capUsd: 10,
      rates: RATES,
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe('over_ceiling');
  });

  test('the same call under the cap is allowed, so the refusal is about the arithmetic', () => {
    const verdict = checkCeiling({
      monthToDateUsd: 1,
      inputTokens: 2000,
      maxOutputTokens: 1024,
      capUsd: 10,
      rates: RATES,
    });
    expect(verdict.allowed).toBe(true);
  });

  test('a live call that cannot be priced is refused rather than made', () => {
    const verdict = checkCeiling({
      monthToDateUsd: 0,
      inputTokens: 2000,
      maxOutputTokens: 1024,
      capUsd: 10,
      rates: { inputPerMTok: null, outputPerMTok: null },
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe('no_rates');
  });

  test('the refused call sends nothing after the count and writes a ledger row anyway', async () => {
    const transport = recordingTransport(demoAiTransport());
    const ledger = recorder();

    const outcome = await runPhotoEstimate({
      settings: { ...LIVE, monthlyCapUsd: 0.001 },
      consent: consentOf({ photo_analysis: true }),
      transport,
      imageBase64: 'AAAA',
      slotLabel: 'Lunch',
      monthToDateUsd: 0,
      record: ledger.record,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('over_ceiling');

    // The count happened, because the ceiling is checked against it. The send
    // did not. That ordering is the line.
    expect(transport.calls.map((call) => call.call)).toEqual(['countTokens']);

    // And the refusal is a row: a month that stopped six calls must not read
    // like a month in which nobody tried.
    expect(ledger.written).toHaveLength(1);
    expect(ledger.written[0].outcome).toBe('refused_over_ceiling');
    expect(ledger.written[0].costUsd).toBe(0);
    expect(ledger.written[0].outputTokens).toBe(0);
    expect(ledger.written[0].inputTokens).toBe(DEMO_INPUT_TOKENS);
  });

  test('a demonstration with rates configured is priced notionally, so the ceiling can be shown with no key', async () => {
    const transport = recordingTransport(demoAiTransport());
    const ledger = recorder();

    const outcome = await runPhotoEstimate({
      settings: { ...LIVE, mode: 'demo', apiKey: '', monthlyCapUsd: 10 },
      consent: consentOf({ photo_analysis: true }),
      transport,
      imageBase64: 'AAAA',
      slotLabel: 'Lunch',
      monthToDateUsd: 0,
      record: ledger.record,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.costUsd).toBeGreaterThan(0);
    expect(ledger.written[0].mode).toBe('demo');
  });
});

describe('the month a spend counts against is the app own calendar month', () => {
  test('an instant just before midnight in Paris on the last of the month is that month', () => {
    // 2026-08-31 23:30 Paris is 2026-08-31T21:30Z. Read in UTC it is still
    // August; read in a zone east of Paris it would be September, which is why
    // the key is computed in the app's own zone and not off the instant.
    expect(monthKey(new Date('2026-08-31T21:30:00Z'), 'Europe/Paris')).toBe('2026-08');
    expect(monthKey(new Date('2026-08-31T22:30:00Z'), 'Europe/Paris')).toBe('2026-09');
  });
});

/** A transport that answers the Models API with one status and records nothing. */
function modelTransport(answer: { ok: boolean; status?: number }): AiTransport {
  return {
    countTokens: async () => ({ ok: true, inputTokens: 0 }),
    send: async () => ({ ok: true, text: '{}', inputTokens: 0, outputTokens: 0, model: '' }),
    retrieveModel: async (id) =>
      answer.ok
        ? { ok: true, id }
        : { ok: false, reason: 'refused', detail: 'not found', status: answer.status ?? 404 },
  };
}

describe('the model identifier is validated once, at boot', () => {
  test('an identifier the Models API knows lets the boot continue', async () => {
    const verdict = await validateModel(LIVE, modelTransport({ ok: true }));
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.checked).toBe(true);
  });

  test('a retired snapshot is a named error and not a warning', async () => {
    const verdict = await validateModel(LIVE, modelTransport({ ok: false, status: 404 }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.message).toBe(strings.api.boot.unknownModel(LIVE.model));
      expect(verdict.message).toContain(LIVE.model);
    }
  });

  test('an API that would not answer is also fatal, and says which status it got', async () => {
    const verdict = await validateModel(LIVE, modelTransport({ ok: false, status: 401 }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toContain('401');
  });

  test('a live installation with no identifier configured refuses to start', async () => {
    const verdict = await validateModel({ ...LIVE, model: '' }, modelTransport({ ok: true }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toBe(strings.api.boot.noModel);
  });

  test('demonstration mode checks nothing and does not claim to have', async () => {
    const verdict = await validateModel({ ...LIVE, mode: 'demo' }, modelTransport({ ok: false }));
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.checked).toBe(false);
  });
});
