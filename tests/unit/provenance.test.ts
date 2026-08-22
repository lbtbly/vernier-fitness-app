import { describe, expect, it } from 'vitest';
import {
  CONFIDENCES,
  IMPORT_VERSION,
  METRICS,
  QUICK_LOG_METRICS,
  SOURCES,
  type ChainRow,
  type StoredCandidate,
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
    isCorrection: false,
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
      [stored({ id: 'corrected-row', rawValue: '99.2', isCorrection: true })],
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

  it('leaves a re-import that agrees with the correction alone', () => {
    const outcome = decideDedup(
      {
        metric: 'waist',
        source: 'withings',
        rawValue: '99.2',
        measuredAt: new Date('2026-08-21T06:00:00Z'),
        timeZone: PARIS,
      },
      [stored({ id: 'corrected-row', rawValue: '99.2', isCorrection: true })],
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
