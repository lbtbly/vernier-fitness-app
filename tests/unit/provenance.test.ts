import { describe, expect, it } from 'vitest';
import {
  CONFIDENCES,
  IMPORT_VERSION,
  METRICS,
  QUICK_LOG_METRICS,
  SOURCES,
  type ChainRow,
  type StoredCandidate,
  checkValue,
  currentOfChain,
  decideDedup,
  isSource,
  orderChain,
  originalOfChain,
  sameDay,
} from '@/lib/provenance';

const PARIS = 'Europe/Paris';

function stored(overrides: Partial<StoredCandidate> = {}): StoredCandidate {
  return {
    id: 'm1',
    metric: 'waist',
    source: 'manual',
    rawValue: '98.5',
    measuredAt: new Date('2026-08-21T05:20:00Z'),
    rootId: 'm1',
    correctionIndex: 0,
    ...overrides,
  };
}

describe('the six sources', () => {
  it('is exactly six, and estimate is not one of them', () => {
    expect(SOURCES).toEqual([
      'withings',
      'apple_health_shortcut',
      'manual',
      'lab_pdf',
      'derived',
      'demo',
    ]);
    expect(isSource('estimate')).toBe(false);
    expect(CONFIDENCES).toContain('estimated');
  });

  it('names an import version, so a row read back knows what wrote it', () => {
    expect(IMPORT_VERSION).toMatch(/^\d{4}-\d{2}-\d+$/);
  });

  it('gives the quick log six metrics and every one of them a unit', () => {
    expect(QUICK_LOG_METRICS).toHaveLength(6);
    for (const metric of QUICK_LOG_METRICS) {
      expect(METRICS[metric].unit).toBeTruthy();
    }
    // A note has no number, and its unit says so rather than pretending to one.
    expect(METRICS.note.unit).toBe('text');
    expect(METRICS.waist.unit).toBe('cm');
  });
});

describe('the deduplication decision', () => {
  it('calls the first reading of a day unique and stores it', () => {
    const outcome = decideDedup(
      {
        metric: 'waist',
        source: 'manual',
        rawValue: '98.0',
        measuredAt: new Date('2026-08-21T16:32:00Z'),
        timeZone: PARIS,
      },
      [],
    );
    expect(outcome.decision).toBe('unique');
    expect(outcome.store).toBe(true);
  });

  it('drops the same fact arriving twice and names the row that was kept', () => {
    const outcome = decideDedup(
      {
        metric: 'waist',
        source: 'manual',
        rawValue: '98.5',
        measuredAt: new Date('2026-08-21T16:32:00Z'),
        timeZone: PARIS,
      },
      [stored({ id: 'kept-me' })],
    );
    expect(outcome.decision).toBe('dropped_as_duplicate');
    expect(outcome.store).toBe(false);
    if (outcome.decision === 'dropped_as_duplicate') expect(outcome.keptId).toBe('kept-me');
  });

  it('keeps a device reading over a hand-typed one for the same day and names the loser', () => {
    const outcome = decideDedup(
      {
        metric: 'weight',
        source: 'withings',
        rawValue: '85.9',
        measuredAt: new Date('2026-08-21T04:52:00Z'),
        timeZone: PARIS,
      },
      [stored({ id: 'typed', metric: 'weight', source: 'manual', rawValue: '86.0' })],
    );
    expect(outcome.decision).toBe('kept_over_duplicate');
    expect(outcome.store).toBe(true);
    expect(outcome.reason.params.value).toBe('86.0');
  });

  it('does not store a hand-typed reading over a device one for the same day', () => {
    const outcome = decideDedup(
      {
        metric: 'weight',
        source: 'manual',
        rawValue: '86.0',
        measuredAt: new Date('2026-08-21T05:10:00Z'),
        timeZone: PARIS,
      },
      [stored({ id: 'scale', metric: 'weight', source: 'withings', rawValue: '85.9' })],
    );
    expect(outcome.decision).toBe('dropped_as_duplicate');
    expect(outcome.store).toBe(false);
  });

  it('treats a different day as a different reading, in the zone it was taken in', () => {
    const outcome = decideDedup(
      {
        metric: 'waist',
        source: 'manual',
        rawValue: '98.5',
        measuredAt: new Date('2026-08-22T16:32:00Z'),
        timeZone: PARIS,
      },
      [stored()],
    );
    expect(outcome.decision).toBe('unique');
  });

  it('reads the day boundary in Paris and not in UTC', () => {
    // 22:40 UTC on 21 August is 00:40 on 22 August in Paris.
    expect(
      sameDay(new Date('2026-08-21T22:40:00Z'), new Date('2026-08-22T09:00:00Z'), PARIS),
    ).toBe(true);
  });
});

describe('a re-import that disagrees with a correction', () => {
  it('is a question, not a decision, and it stores nothing', () => {
    const outcome = decideDedup(
      {
        metric: 'waist',
        source: 'withings',
        rawValue: '92.2',
        measuredAt: new Date('2026-08-21T06:00:00Z'),
        timeZone: PARIS,
      },
      [stored({ id: 'corrected-row', rootId: 'orig', correctionIndex: 1, rawValue: '99.2' })],
    );

    expect(outcome.decision).toBe('held_for_question');
    expect(outcome.store).toBe(false);
    if (outcome.decision === 'held_for_question') {
      expect(outcome.conflictsWith).toBe('corrected-row');
      // Both numbers travel with the question. Neither is chosen here.
      expect(outcome.reason.params.corrected).toBe('99.2');
      expect(outcome.reason.params.incoming).toBe('92.2');
    }
  });

  it('names the value that stands today, not the first correction in the chain', () => {
    // Corrected twice: 92.2 became 99.2, and 99.2 became 99.4. A question that
    // quotes 92.2 tells the owner something untrue about his own data.
    const outcome = decideDedup(
      {
        metric: 'waist',
        source: 'withings',
        rawValue: '92.2',
        measuredAt: new Date('2026-08-21T06:00:00Z'),
        timeZone: PARIS,
      },
      [
        stored({ id: 'original', rootId: 'orig', correctionIndex: 0, rawValue: '92.2' }),
        stored({ id: 'first', rootId: 'orig', correctionIndex: 1, rawValue: '99.2' }),
        stored({ id: 'head', rootId: 'orig', correctionIndex: 2, rawValue: '99.4' }),
      ],
    );

    expect(outcome.decision).toBe('held_for_question');
    if (outcome.decision === 'held_for_question') {
      expect(outcome.conflictsWith).toBe('head');
      expect(outcome.reason.params.corrected).toBe('99.4');
    }
  });

  it('leaves a re-import that agrees with the correction alone', () => {
    const outcome = decideDedup(
      {
        metric: 'waist',
        source: 'withings',
        rawValue: '99.2',
        measuredAt: new Date('2026-08-21T06:00:00Z'),
        timeZone: PARIS,
      },
      [stored({ id: 'corrected-row', rootId: 'orig', correctionIndex: 1, rawValue: '99.2' })],
    );
    expect(outcome.decision).not.toBe('held_for_question');
  });
});

describe('the correction chain', () => {
  const chain: ChainRow[] = [
    { id: 'c2', rootId: 'orig', correctsId: 'c1', correctionIndex: 2, rawValue: '99.0' },
    { id: 'orig', rootId: 'orig', correctsId: null, correctionIndex: 0, rawValue: '92.2' },
    { id: 'c3', rootId: 'orig', correctsId: 'c2', correctionIndex: 3, rawValue: '99.2' },
    { id: 'c1', rootId: 'orig', correctsId: 'orig', correctionIndex: 1, rawValue: '98.5' },
  ];

  it('holds four rows after three edits, and the original is one of them', () => {
    expect(chain).toHaveLength(4);
    expect(orderChain(chain).map((row) => row.id)).toEqual(['orig', 'c1', 'c2', 'c3']);
  });

  it('gives back the original after three edits, whatever order the rows arrived in', () => {
    expect(originalOfChain(chain)?.rawValue).toBe('92.2');
  });

  it('reads the last correction as the value that stands today', () => {
    expect(currentOfChain(chain)?.rawValue).toBe('99.2');
  });

  it('never loses a row to ordering', () => {
    expect(orderChain(chain).map((row) => row.rawValue)).toEqual(['92.2', '98.5', '99.0', '99.2']);
  });
});

/**
 * The gate every write passes, corrections included.
 *
 * These cases are not hypothetical. Correcting a rating to 99 and then to -4.7
 * was accepted twice, and `measurement` refuses DELETE, so both rows are still
 * in a chain somewhere as a matter of record. A rule that runs on one write
 * path and not the other is not a rule, and in an append-only table it is
 * permanent damage rather than a bug to be cleaned up later.
 */
describe('what Vernier will store', () => {
  it('takes a rating that is a whole number inside the band', () => {
    expect(checkValue('energy', '4')).toEqual({ ok: true, value: 4 });
  });

  it('refuses 99 for a rating out of five', () => {
    expect(checkValue('energy', '99')).toEqual({ ok: false, problem: 'rating', low: 1, high: 5 });
  });

  it('refuses a negative rating', () => {
    expect(checkValue('energy', '-4.7')).toEqual({ ok: false, problem: 'rating', low: 1, high: 5 });
  });

  it('refuses a fractional rating', () => {
    expect(checkValue('satiety', '3.5')).toEqual({ ok: false, problem: 'rating', low: 1, high: 5 });
  });

  it('refuses a word where a number belongs', () => {
    expect(checkValue('waist', 'ninety-seven')).toEqual({
      ok: false,
      problem: 'notANumber',
      low: 30,
      high: 250,
    });
  });

  it('refuses a waist measurement outside the band a tape can produce', () => {
    expect(checkValue('waist', '4000')).toEqual({ ok: false, problem: 'range', low: 30, high: 250 });
    expect(checkValue('waist', '0')).toEqual({ ok: false, problem: 'range', low: 30, high: 250 });
  });

  it('takes a waist measurement inside it', () => {
    expect(checkValue('waist', '98.5')).toEqual({ ok: true, value: 98.5 });
  });

  it('stores a free note with no number rather than a zero', () => {
    expect(checkValue('note', 'Slept badly.')).toEqual({ ok: true, value: null });
  });

  it('refuses a blank field on every metric, and never stores it as zero', () => {
    for (const metric of QUICK_LOG_METRICS) {
      expect(checkValue(metric, '   ')).toMatchObject({ ok: false, problem: 'blank' });
    }
  });

  it('refuses a metric it has never heard of', () => {
    expect(checkValue('blood_pressure', '120')).toMatchObject({
      ok: false,
      problem: 'unknownMetric',
    });
  });

  it('gives every metric a band, so no writer can be the one without a rule', () => {
    for (const [name, rule] of Object.entries(METRICS)) {
      expect(typeof rule.low, name).toBe('number');
      expect(typeof rule.high, name).toBe('number');
      if (rule.kind !== 'text') expect(rule.high, name).toBeGreaterThan(rule.low);
    }
  });
});
