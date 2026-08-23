import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  BUNDLED_MEDIA,
  MOVEMENTS,
  alternativesFor,
  easierThan,
  harderThan,
  mediaFor,
  movementOf,
} from '@/lib/catalogue';
import { movementCue, movementName } from '@/lib/display';

/**
 * The catalogue, counted and walked.
 *
 * F66 is a count and a property of every row in it: at least 30 movements, each
 * with cue text and a bundled still or animation that renders with the network
 * disabled. The count is asserted with the population printed beside it, and
 * the property is walked over every movement rather than sampled, because a
 * spot check over 5 of 44 is a check that can pass while 39 are empty.
 *
 * F67's null-author rule is checked at three points in this build and this is
 * the first: the manifest itself. The other two are the NOT NULL column and the
 * check constraint in `drizzle/pending/08-train.sql`, which is where a psql
 * prompt meets it.
 */

const PUBLIC = join(process.cwd(), 'public');
const REQUIRED_MOVEMENTS = 30;

describe('the catalogue holds enough movements to plan a week from', () => {
  test(`at least ${REQUIRED_MOVEMENTS} movements, and here is the population`, () => {
    const ids = MOVEMENTS.map((movement) => movement.id);
    // The population, printed beside the count, because a number without the
    // list it came from reads the same whether the list is right or empty.
    expect(ids.length).toBeGreaterThanOrEqual(REQUIRED_MOVEMENTS);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('push-up');
    expect(ids).toContain('bodyweight-squat');
    expect(ids).toContain('front-plank');
  });

  test('the three session shapes the owner actually has are all covered', () => {
    const modalities = new Set(MOVEMENTS.map((movement) => movement.modality));
    expect([...modalities].sort()).toEqual(['cardio', 'mobility', 'resistance']);
    expect(MOVEMENTS.filter((movement) => movement.equipment.includes('treadmill')).length).toBeGreaterThan(0);
    expect(MOVEMENTS.filter((movement) => movement.equipment.includes('bike')).length).toBeGreaterThan(0);
    expect(MOVEMENTS.filter((movement) => movement.modality === 'resistance').length).toBeGreaterThan(20);
  });
});

describe('every movement carries cue text and a bundled demonstration', () => {
  test.each(MOVEMENTS.map((movement) => movement.id))('%s has a name and a cue', (id) => {
    const name = movementName(id);
    const cue = movementCue(id);
    expect(name).not.toBe(id);
    expect(name.length).toBeGreaterThan(2);
    // A cue is a coaching sentence, not a word. Anything under this is a
    // placeholder, which is on the disqualifier list.
    expect(cue.length).toBeGreaterThan(40);
    expect(cue).toMatch(/[.]$/);
  });

  test.each(MOVEMENTS.map((movement) => movement.id))('%s has a bundled file on this disk', (id) => {
    const record = mediaFor(id);
    expect(record).not.toBeNull();
    expect(record!.embeddingMode).toBe('bundled');
    const path = join(PUBLIC, record!.path.replace(/^\//, ''));
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(400);
    expect(statSync(path).size).toBe(record!.bytes);
  });
});

describe('a media record with no author does not exist', () => {
  test('every record names an author, and here is the list of them', () => {
    const authors = [...new Set(BUNDLED_MEDIA.map((record) => record.author))].sort();
    expect(BUNDLED_MEDIA.length).toBeGreaterThanOrEqual(REQUIRED_MOVEMENTS);
    expect(authors.length).toBeGreaterThan(3);
    for (const record of BUNDLED_MEDIA) {
      expect(record.author.trim()).not.toBe('');
      expect(record.movement).not.toBe('');
      expect(record.url).toMatch(/^(https:\/\/|\/movements\/)/);
      expect(record.licence.trim()).not.toBe('');
      expect(record.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('nothing from the aggregator sets is in here', () => {
    // .forge/research/exercise-media.md section 2.6: free-exercise-db's 1,746
    // images are not the maintainer's to license, and the downstream mirrors
    // launder nothing. There is no author to record for any of them, which is
    // the rule that keeps them out rather than a list of banned domains.
    for (const record of BUNDLED_MEDIA) {
      expect(record.url).not.toMatch(/free-exercise-db|exercisedb|musclewiki|exrx/i);
    }
  });

  test('the licences are the ones this build is allowed to use', () => {
    const allowed = new Set(['CC BY-SA 4.0', 'CC BY 4.0', 'CC BY 3.0', 'Public domain', 'Original artwork']);
    for (const record of BUNDLED_MEDIA) {
      expect(allowed.has(record.licence)).toBe(true);
    }
  });

  test('the whole bundled layer is small enough to ship', () => {
    const megabytes = BUNDLED_MEDIA.reduce((sum, record) => sum + record.bytes, 0) / 1024 / 1024;
    expect(megabytes).toBeGreaterThan(0.5);
    expect(megabytes).toBeLessThan(6);
  });
});

describe('the ladder, which is what easier and harder mean', () => {
  test('the easiest of a pattern has nothing below it and the hardest nothing above', () => {
    expect(easierThan('wall-push-up')).toBeNull();
    expect(harderThan('chest-dip')).toBeNull();
  });

  test('easier is one step down and harder is one step up, on the same pattern', () => {
    const easier = easierThan('push-up')!;
    const harder = harderThan('push-up')!;
    expect(easier.pattern).toBe('push');
    expect(harder.pattern).toBe('push');
    expect(easier.step).toBeLessThan(movementOf('push-up')!.step);
    expect(harder.step).toBeGreaterThan(movementOf('push-up')!.step);
  });

  test('every movement offers at least one alternative, so the replace control is never empty', () => {
    for (const movement of MOVEMENTS) {
      const alternatives = alternativesFor(movement.id);
      const offered = [alternatives.easier, alternatives.harder, alternatives.substitute].filter(Boolean);
      expect(offered.length).toBeGreaterThan(0);
    }
  });

  test('a substitute loads at least one of the same muscles', () => {
    for (const movement of MOVEMENTS) {
      const substitute = alternativesFor(movement.id).substitute;
      if (!substitute) continue;
      expect(substitute.muscles.some((muscle) => movement.muscles.includes(muscle))).toBe(true);
      expect(substitute.id).not.toBe(movement.id);
    }
  });
});

describe('the prescription every movement carries', () => {
  test('rest is never under 60 seconds on a resistance movement', () => {
    for (const movement of MOVEMENTS.filter((entry) => entry.modality === 'resistance')) {
      expect(movement.restSeconds).toBeGreaterThanOrEqual(60);
      expect(movement.restSeconds).toBeLessThanOrEqual(120);
    }
  });

  test('sets start at 1 to 3, which is what the evidence supports for a beginner', () => {
    for (const movement of MOVEMENTS.filter((entry) => entry.modality === 'resistance')) {
      expect(movement.sets).toBeGreaterThanOrEqual(1);
      expect(movement.sets).toBeLessThanOrEqual(3);
    }
  });

  test('every band is a range and the low end is under the high end', () => {
    for (const movement of MOVEMENTS) {
      expect(movement.low).toBeLessThan(movement.high);
    }
  });

  test('resistance asks for reps in reserve and cardio asks the public-domain scale', () => {
    for (const movement of MOVEMENTS) {
      if (movement.modality === 'resistance') expect(movement.effortScale).toBe('rir');
      if (movement.modality === 'cardio') expect(movement.effortScale).toBe('cdc');
      if (movement.modality === 'mobility') expect(movement.effortScale).toBe('none');
    }
  });
});
