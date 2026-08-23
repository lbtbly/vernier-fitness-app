import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { AI_CATEGORIES, CONSENT_DEFAULT, consentOf } from '@/lib/ai/consent';
import { demoAiTransport, DEMO_INPUT_TOKENS, DEMO_OUTPUT_TOKENS } from '@/lib/ai/demo';
import { type AiSettings } from '@/lib/ai/mode';
import { runPhotoEstimate, type UsageRecord } from '@/lib/ai/service';
import { recordingTransport } from '@/lib/ai/transport';

/**
 * With a switch off, NO OUTBOUND REQUEST IS MADE. F94.
 *
 * The line is explicit that the evidence is a request log and not a screen
 * state, because a disabled button proves nothing about a server. So every
 * assertion below reads `transport.calls`, which is the recording seam every
 * request in this product goes through, and the interesting number is zero.
 *
 * WHAT WOULD MAKE THIS GO RED. Moving the consent check below the token count,
 * which is the most likely way this breaks, puts one `countTokens` entry in the
 * log and fails the first test immediately. So would a component that uploaded
 * the photograph before asking, because the route reads consent before it reads
 * the file.
 *
 * THE POPULATION IS PRINTED. A zero beside nothing is not evidence, so the
 * second block prints every request-building site in the shipped tree and
 * fails if that population is empty or if any site builds a request for a
 * category with no switch above it.
 */

const DEMO_SETTINGS: AiSettings = {
  mode: 'demo',
  apiKey: '',
  model: 'claude-opus-5',
  monthlyCapUsd: 10,
  maxOutputTokens: 1024,
  rates: { inputPerMTok: null, outputPerMTok: null },
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

describe('a category that is switched off makes no request', () => {
  test('photo analysis off: zero calls, zero ledger rows, and a named refusal', async () => {
    const transport = recordingTransport(demoAiTransport());
    const ledger = recorder();

    const outcome = await runPhotoEstimate({
      settings: DEMO_SETTINGS,
      consent: CONSENT_DEFAULT,
      transport,
      imageBase64: 'AAAA',
      slotLabel: 'Lunch',
      monthToDateUsd: 0,
      record: ledger.record,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('consent_off');
    expect(transport.calls).toHaveLength(0);
    expect(ledger.written).toHaveLength(0);
  });

  test('photo analysis on: the count comes before the send, in that order', async () => {
    const transport = recordingTransport(demoAiTransport());
    const ledger = recorder();

    const outcome = await runPhotoEstimate({
      settings: DEMO_SETTINGS,
      consent: consentOf({ photo_analysis: true }),
      transport,
      imageBase64: 'AAAA',
      slotLabel: 'Lunch',
      monthToDateUsd: 0,
      record: ledger.record,
    });

    expect(outcome.ok).toBe(true);
    expect(transport.calls.map((call) => call.call)).toEqual(['countTokens', 'send']);
    expect(ledger.written).toHaveLength(1);
    expect(ledger.written[0].outcome).toBe('charged');
  });

  test('the other three switches are off by default and turning one on sends nothing here', async () => {
    const transport = recordingTransport(demoAiTransport());
    const ledger = recorder();

    // Every category EXCEPT photo analysis, all on. The photo flow still
    // refuses, because it reads its own switch and no other.
    const consent = consentOf({
      menu_generation: true,
      health_explanations: true,
      calendar_titles: true,
    });

    const outcome = await runPhotoEstimate({
      settings: DEMO_SETTINGS,
      consent,
      transport,
      imageBase64: 'AAAA',
      slotLabel: 'Lunch',
      monthToDateUsd: 0,
      record: ledger.record,
    });

    expect(outcome.ok).toBe(false);
    expect(transport.calls).toHaveLength(0);
  });
});

describe('demonstration mode runs the whole flow with no key', () => {
  test('the same parser, the same range, the same ledger row, and no key anywhere', async () => {
    const transport = recordingTransport(demoAiTransport());
    const ledger = recorder();

    const outcome = await runPhotoEstimate({
      settings: { ...DEMO_SETTINGS, apiKey: '' },
      consent: consentOf({ photo_analysis: true }),
      transport,
      imageBase64: 'AAAA',
      slotLabel: 'Lunch',
      monthToDateUsd: 0,
      record: ledger.record,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.mode).toBe('demo');
      expect(outcome.reading.items.length).toBeGreaterThan(0);
      expect(outcome.inputTokens).toBe(DEMO_INPUT_TOKENS);
      expect(outcome.outputTokens).toBe(DEMO_OUTPUT_TOKENS);
      // No rate table configured, so a demonstration costs nothing and says so
      // rather than refusing: F95's whole flow does not depend on the owner
      // having filled in prices for calls he is not being charged for.
      expect(outcome.costUsd).toBe(0);
    }
    expect(ledger.written[0].mode).toBe('demo');
  });
});

/**
 * Every place in the shipped tree that builds a request for a model.
 *
 * The four categories are independent, and three of them have no sender in this
 * build yet: menu generation is deterministic in slice 9, the laboratory
 * explanations are templates in slice 7, and the calendar titles are slice 11.
 * So "no request is made for that category" is true of those three for a
 * stronger reason than a switch, and this is the check that keeps it true: a
 * slice that adds a sender without a switch above it fails here.
 */
const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) found.push(path);
  }
  return found;
}

describe('every sender in the tree names a category that has a switch', () => {
  test('the purposes built anywhere in src are a subset of the four, and the walk is not empty', () => {
    const files = walk(srcRoot);
    expect(files.length).toBeGreaterThan(100);

    /*
     * The population is every file that reaches the AI layer at all, because a
     * request cannot be built without importing it: `AiRequest` is the only
     * shape the transport takes and it is declared in one module. Scanning the
     * whole tree for the word "purpose" instead would sweep in the manifest's
     * icon entries and the integration copy, and a check that has to ignore
     * three quarters of its own matches is a check nobody trusts.
     */
    const reaching = files.filter((path) => readFileSync(path, 'utf8').includes('@/lib/ai/'));
    expect(reaching.length).toBeGreaterThan(0);

    const purposes = new Set<string>();
    const senders: string[] = [];
    for (const path of reaching) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/purpose:\s*'([a-z_]+)'/g)) {
        purposes.add(match[1]);
        senders.push(`${path.slice(srcRoot.length)}:${match[1]}`);
      }
    }

    // Printed, so the zero below is read beside the population it covered.
    console.log(
      `ai senders: ${senders.length} in ${reaching.length} file(s) that reach the AI layer, ` +
        `out of ${files.length} walked: ${senders.join(', ')}`,
    );
    expect(senders.length).toBeGreaterThan(0);
    for (const purpose of purposes) {
      expect(AI_CATEGORIES).toContain(purpose as (typeof AI_CATEGORIES)[number]);
    }
    // Today exactly one category has a sender. When a later slice adds one, it
    // adds a line here rather than discovering the gap in production.
    expect([...purposes].sort()).toEqual(['photo_analysis']);
  });
});
