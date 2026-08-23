import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfirmSkipped, confirmSelected, confirmUndo } from '@/lib/google/client';
import { WRITE_SITES, WRITE_SITE_COUNT, type WriteInput } from '@/lib/google/write-sites';
import { harness, okAnswer } from './google-harness';

/**
 * F110 and C14. EVERY OUTBOUND WRITE CALL SITE IS ENUMERATED, EACH IS REACHABLE
 * ONLY FROM A CONFIRMATION, AND DRIVING EACH ONE WITH THE CONFIRMATION SKIPPED
 * WRITES NOTHING.
 *
 * A test over an empty set of call sites proves nothing, so the enumeration is
 * printed and asserted before it is driven, and it is checked against the source
 * as well as against itself: the number of write requests built anywhere under
 * `src/` has to equal the number of entries in the list. That is what makes the
 * list complete rather than merely accurate, and it is the difference between
 * "these four are guarded" and "only these four exist".
 *
 * WHAT WOULD MAKE THIS GO RED. A sixth write site added anywhere. A `kind:
 * 'write'` request built outside `write-sites.ts`. A confirmation minted by a
 * third function. `callGoogle` checking the confirmation after it touches the
 * transport rather than before. Any one of those and one of the counts below
 * stops matching.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The file with its block comments taken out.
 *
 * Every prose block in this repository explains the rule it sits beside, so the
 * strings this test counts appear in the comments as well as in the code. A
 * census that counted both would report seven call sites where there are five,
 * and a later reader would trust the number. Comments are removed and the code
 * is counted.
 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) found.push(path);
  }
  return found;
}

const input: WriteInput = {
  calendarId: 'vernier-training@group.calendar.google.com',
  eventId: 'vrnr0000000000000000',
  sessionId: 'plan_session_1',
  summary: 'Training: Strength',
  description: 'Written by Vernier.',
  start: new Date('2026-08-24T17:00:00.000Z'),
  end: new Date('2026-08-24T17:45:00.000Z'),
  timeZone: 'Europe/Paris',
  mode: 'demonstration',
};

describe('F110, the enumerated write sites', () => {
  it('enumerates every one of them, and the enumeration is not empty', () => {
    const ids = WRITE_SITES.map((site) => `${site.method} ${site.id}`);
    console.log(`outbound write call sites, enumerated:\n  ${ids.join('\n  ')}`);
    expect(WRITE_SITES.length).toBe(WRITE_SITE_COUNT);
    expect(WRITE_SITES.length).toBeGreaterThan(0);
    expect(new Set(WRITE_SITES.map((site) => site.id)).size).toBe(WRITE_SITES.length);
    expect(ids).toEqual([
      'POST calendars.insert',
      'DELETE calendars.delete',
      'POST events.insert',
      'PUT events.update',
      'DELETE events.delete',
    ]);
  });

  it('drives each one with the confirmation skipped, and each one writes nothing', async () => {
    // ONE TEST PER CALL SITE, driven, with its own zero-write assertion beside
    // the population it walked. `null` is the confirm step skipped: the row was
    // never ticked, or the handler was reached by a route that never drew a
    // diff.
    const walked: string[] = [];
    for (const site of WRITE_SITES) {
      const rig = harness({ answer: () => okAnswer() });
      let refused = false;
      try {
        await site.run(rig.ports, null, input);
      } catch (error) {
        refused = error instanceof ConfirmSkipped;
      }
      walked.push(`${site.id}: refused=${refused}, requests sent=${rig.sent.length}`);
      expect(refused).toBe(true);
      // THE TRANSPORT WAS NEVER TOUCHED. Not "no write landed": no request at
      // all, because the guard runs before the token is read.
      expect(rig.sent).toEqual([]);
      expect(rig.writes()).toEqual([]);
    }
    console.log(`skipped-confirm drive:\n  ${walked.join('\n  ')}`);
    expect(walked.length).toBe(WRITE_SITE_COUNT);
  });

  it('refuses a confirmation somebody made up, and one for a different row', async () => {
    const plan = { id: 'plan_1', state: 'open', rowIds: ['plan_1_r0', 'plan_1_r1'] };
    const real = confirmSelected(plan, ['plan_1_r0'], new Date())[0];
    const forged = { ...real, proof: 'f'.repeat(64) };
    const swapped = { ...real, rowId: 'plan_1_r1' };

    const attempts: Array<[string, typeof real]> = [
      ['a proof invented by hand', forged],
      ['a proof lifted onto another row', swapped],
    ];
    for (const [what, confirmation] of attempts) {
      const rig = harness({ answer: () => okAnswer() });
      let refused = false;
      try {
        await WRITE_SITES[2].run(rig.ports, confirmation, input);
      } catch (error) {
        refused = error instanceof ConfirmSkipped;
      }
      console.log(`${what}: refused=${refused}, requests sent=${rig.sent.length}`);
      expect(refused).toBe(true);
      expect(rig.sent).toEqual([]);
    }

    // And the real one goes through, so the refusals above are the guard working
    // rather than the harness being broken.
    const rig = harness({ answer: () => okAnswer({ id: input.eventId }) });
    const answer = await WRITE_SITES[2].run(rig.ports, real, input);
    console.log(`the confirmation the plan minted: outcome=${answer.outcome}, requests sent=${rig.sent.length}`);
    expect(answer.outcome).toBe('ok');
    expect(rig.sent.length).toBe(1);
  });

  it('mints a confirmation from a plan only while it is open and the row is on it', () => {
    const now = new Date('2026-08-23T18:45:00.000Z');
    const open = { id: 'plan_1', state: 'open', rowIds: ['plan_1_r0'] };
    expect(confirmSelected(open, ['plan_1_r0'], now).length).toBe(1);
    // A plan already applied cannot be applied again.
    expect(confirmSelected({ ...open, state: 'applied' }, ['plan_1_r0'], now)).toEqual([]);
    expect(confirmSelected({ ...open, state: 'superseded' }, ['plan_1_r0'], now)).toEqual([]);
    // A row identifier the screen never drew mints nothing.
    expect(confirmSelected(open, ['plan_1_r9'], now)).toEqual([]);
    // And a request that ticks nothing mints nothing.
    expect(confirmSelected(open, [], now)).toEqual([]);
  });

  it('mints an undo confirmation only from a write that happened and was not undone', () => {
    const now = new Date('2026-08-23T18:45:00.000Z');
    expect(confirmUndo({ id: 'cw_1', outcome: 'written', undoneByWriteId: null }, now)).not.toBeNull();
    expect(confirmUndo({ id: 'cw_1', outcome: 'failed', undoneByWriteId: null }, now)).toBeNull();
    expect(confirmUndo({ id: 'cw_1', outcome: 'written', undoneByWriteId: 'cw_2' }, now)).toBeNull();
  });

  it('builds a write request in exactly one file, which is what makes the list complete', () => {
    // The enumeration is only worth anything if nothing outside it can build a
    // write. Every outbound write goes through `callGoogle` with `kind: 'write'`,
    // so this counts that construct across the whole of src/ and prints where
    // each one is.
    //
    // A CONSTRUCTED REQUEST ENDS THE PROPERTY WITH A COMMA and a type member
    // ends it with a semicolon, so the two are counted apart rather than
    // together: `GoogleRequest` in client.ts DECLARES the shape once, which is
    // not a call site, and counting it as one would report six where there are
    // five and teach a later reader to trust the wrong number.
    const files = walk(join(root, 'src'));
    const sites: string[] = [];
    const declarations: string[] = [];
    for (const file of files) {
      const text = code(readFileSync(file, 'utf8'));
      for (const _ of text.matchAll(/kind:\s*'write',/g)) sites.push(file.slice(root.length));
      for (const _ of text.matchAll(/kind:\s*'write';/g)) declarations.push(file.slice(root.length));
    }
    console.log(`the write request shape is declared in: ${declarations.join(', ')}`);
    expect(declarations).toEqual(['src/lib/google/client.ts']);
    console.log(`files under src/ walked: ${files.length}`);
    console.log(`write requests built:\n  ${sites.join('\n  ')}`);

    // The population beside the claim: the walk is not empty, and every one of
    // the write requests is in the one file that owns them.
    expect(files.length).toBeGreaterThan(100);
    expect(sites.length).toBe(WRITE_SITE_COUNT);
    for (const site of sites) {
      expect(site).toBe('src/lib/google/write-sites.ts');
    }
  });

  it('mints a confirmation in exactly two places, both named', () => {
    // The other half of the same claim. A guard that demands a value is only as
    // strong as the number of places that value can be made.
    const files = walk(join(root, 'src'));
    const mints: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of code(text).matchAll(/proof:\s*proofFor\(/g)) {
        mints.push(`${file.slice(root.length)} at index ${match.index}`);
      }
    }
    console.log(`confirmation mints:\n  ${mints.join('\n  ')}`);
    expect(mints.length).toBe(2);
    for (const mint of mints) {
      expect(mint.startsWith('src/lib/google/client.ts')).toBe(true);
    }
  });
});
