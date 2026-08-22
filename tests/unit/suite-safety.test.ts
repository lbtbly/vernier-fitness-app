import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The suite cannot destroy the owner's data, read off the suite.
 *
 * This is a static check and it is deliberately not a clever one. The e2e suite
 * ran a TRUNCATE against the owner's live database behind a guard that counted
 * rows older than the run, and a waist reading logged through the shipped quick
 * log after the run started was not older than the run: the count stayed at 0,
 * the TRUNCATE went ahead, and the row died. Slice 5 imports the owner's real
 * Withings history, so a run's timing must never again be the thing standing
 * between an import and a TRUNCATE.
 *
 * Two properties, both structural:
 *
 *   1. The helper that reaches the owner's database connects with
 *      `default_transaction_read_only` on, so Postgres refuses every write it
 *      is handed, whatever the statement says and whoever wrote it.
 *   2. No TRUNCATE, DELETE, INSERT or UPDATE in the suite is handed to that
 *      helper. Every one of them goes to `scratchQuery`, which names the
 *      scratch database.
 *
 * A grep is the right shape here. The property being asserted is about what the
 * source says, and a test that ran the statements to find out would be the very
 * thing it is checking for.
 */
const e2e = fileURLToPath(new URL('../e2e/', import.meta.url));

function sources(): Array<[string, string]> {
  return readdirSync(e2e)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(join(e2e, name), 'utf8')]);
}

const WRITES = /\b(truncate|delete\s+from|insert\s+into|update\s+\w+\s+set)\b/i;

describe('the suite against the owner\'s installation', () => {
  it('reaches the live database through a read-only transaction and no other way', () => {
    const host = readFileSync(join(e2e, 'host.ts'), 'utf8');
    const live = host.slice(host.indexOf('export function query('), host.indexOf('export function recovery('));
    expect(live).toContain("PGOPTIONS='-c default_transaction_read_only=on'");
    expect(live).toContain('$POSTGRES_DB');

    // And exactly one function in the suite connects to the live database.
    const connections = [...host.matchAll(/-d "\$POSTGRES_DB"/g)];
    expect(connections.length).toBe(1);
  });

  it('hands every write statement to the scratch database and never to the live one', () => {
    const offenders: string[] = [];
    const helpers = ['scratchQuery(', 'scratchAttempt(', 'query('];
    for (const [name, source] of sources()) {
      for (const match of source.matchAll(new RegExp(WRITES, 'gi'))) {
        // Which helper is carrying this statement. A statement written across
        // several lines reaches its call on an earlier line, so what is read is
        // the nearest call before it rather than the line it sits on.
        const before = source.slice(0, match.index);
        const nearest = helpers
          .map((helper) => [helper, before.lastIndexOf(helper)] as const)
          .filter(([, at]) => at !== -1)
          .sort((left, right) => right[1] - left[1])[0];
        // No call before it at all is prose: a comment, or a sentence in a
        // message about what may not be done.
        if (!nearest) continue;
        if (nearest[0] !== 'query(') continue;
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${name}:${line}  ${match[0]}`);
      }
    }
    expect(offenders, 'a write statement in the e2e suite that is not aimed at the scratch database').toEqual([]);
  });

  it('keeps the destructive helper pointed at the scratch database by name', () => {
    const host = readFileSync(join(e2e, 'host.ts'), 'utf8');
    expect(host).toContain('export function resetScratchProvenance()');
    expect(host).not.toContain('export function resetProvenance(');
    const reset = host.slice(host.indexOf('export function resetScratchProvenance()'));
    expect(reset).toContain('scratchQuery(');
    expect(reset).toContain('SCRATCH_CONTAINER');
  });

  it('names the scratch database in the only place a connection string is built for it', () => {
    const host = readFileSync(join(e2e, 'host.ts'), 'utf8');
    const scratchReads = [...host.matchAll(/-d vernier_scratch/g)];
    expect(scratchReads.length).toBeGreaterThan(0);
  });
});
