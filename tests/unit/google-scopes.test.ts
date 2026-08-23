import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_SCOPES, GOOGLE_SCOPES, SCOPE_PARAM } from '@/lib/google/scopes';
import { authorizeUrl, scopesOf } from '@/lib/google/protocol';

/**
 * F102. THE SCOPE LIST IN CODE IS THE SCOPE LIST IN THE DOCUMENT, CHARACTER FOR
 * CHARACTER, and neither of them holds a scope that can write to a calendar this
 * app did not create.
 *
 * Three documents and one array, compared as text rather than as meaning. Four
 * sources, and a single character of difference between any two of them fails:
 *
 *   - `src/lib/google/scopes.ts`, which is what the request carries.
 *   - `.forge/research/google-calendar.md`, which read the strings off Google's
 *     own auth page on 2026-08-21 and is the reason they are these three.
 *   - `docs/google-calendar.md`, which is what the owner pastes into the Cloud
 *     console's Data access page.
 *   - `SETUP.html`, which is the sheet he actually has open while he does it,
 *     with a copy button beside the three.
 *
 * WHAT WOULD MAKE THIS GO RED. Adding a fourth scope anywhere. Reordering them.
 * One character out of place in any of the four, including the `https`.
 * Requesting `calendar` or `calendar.events`, which is the whole risk this line
 * exists to close, since either one grants write access to every calendar the
 * owner can touch.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));

/** Every scope-shaped string in a document, in the order it appears. */
function scopesIn(path: string): string[] {
  const text = readFileSync(`${root}${path}`, 'utf8');
  const found = [...text.matchAll(/https:\/\/www\.googleapis\.com\/auth\/[A-Za-z0-9._]+/g)].map(
    (match) => match[0],
  );
  return found;
}

/** The three, in order, as the fenced block a person copies out of a document. */
function requestedBlock(path: string): string[] {
  const text = readFileSync(`${root}${path}`, 'utf8');
  const blocks = [...text.matchAll(/```\n([^`]*?)```/g)].map((match) => match[1]);
  const wanted = blocks.find(
    (block) =>
      block.includes('calendar.calendarlist.readonly') &&
      block.includes('calendar.freebusy') &&
      block.includes('calendar.app.created') &&
      !block.includes('client_id'),
  );
  return (wanted ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

/** The three the owner copies out of the setup sheet, in the order they are drawn. */
function setupSheetBlock(): string[] {
  const text = readFileSync(`${root}SETUP.html`, 'utf8');
  const found = /<code id="gscopes">([^<]*)<\/code>/.exec(text);
  return (found?.[1] ?? '').split(/\s+/).filter((entry) => entry !== '');
}

describe('F102, the scope list', () => {
  it('is exactly three, in one order, and the code matches all three documents', () => {
    const research = requestedBlock('.forge/research/google-calendar.md');
    const document = requestedBlock('docs/google-calendar.md');
    const sheet = setupSheetBlock();

    console.log(`code:     ${GOOGLE_SCOPES.join('\n          ')}`);
    console.log(`research: ${research.join('\n          ')}`);
    console.log(`document: ${document.join('\n          ')}`);
    console.log(`sheet:    ${sheet.join('\n          ')}`);

    // The population beside the comparison: four lists were found and none of
    // them is empty, so this is not a walk over nothing.
    expect(GOOGLE_SCOPES.length).toBe(3);
    expect(research.length).toBe(3);
    expect(document.length).toBe(3);
    expect(sheet.length).toBe(3);

    // CHARACTER FOR CHARACTER, in order.
    expect(research).toEqual([...GOOGLE_SCOPES]);
    expect(document).toEqual([...GOOGLE_SCOPES]);
    expect(sheet).toEqual([...GOOGLE_SCOPES]);
    expect(SCOPE_PARAM).toBe(GOOGLE_SCOPES.join(' '));
  });

  it('names neither the full calendar scope nor the all-events scope, anywhere', () => {
    // Not just absent from the request: absent from the code and from both
    // documents' request blocks. A scope declared in a console and never sent is
    // an over-broad grant sitting on the account.
    const everywhere = [
      ...GOOGLE_SCOPES,
      ...requestedBlock('.forge/research/google-calendar.md'),
      ...requestedBlock('docs/google-calendar.md'),
      ...setupSheetBlock(),
    ];
    console.log(`scope strings compared: ${everywhere.length}`);
    expect(everywhere.length).toBe(12);

    for (const forbidden of FORBIDDEN_SCOPES) {
      expect(everywhere).not.toContain(forbidden);
    }
    // And the two that matter most, by name, so the assertion reads as the rule.
    expect(everywhere).not.toContain('https://www.googleapis.com/auth/calendar');
    expect(everywhere).not.toContain('https://www.googleapis.com/auth/calendar.events');
  });

  it('puts exactly those three on the authorization request and nothing else', () => {
    const url = authorizeUrl({
      clientId: 'client.example',
      redirectUri: 'https://example.test/api/integrations/google/callback',
      state: 'state-value',
    });
    const requested = scopesOf(url);
    console.log(`authorize scope parameter: ${requested.join(' ')}`);
    expect(requested).toEqual([...GOOGLE_SCOPES]);
    for (const forbidden of FORBIDDEN_SCOPES) {
      expect(requested).not.toContain(forbidden);
    }
  });

  it('reads the whole research note and finds no wider scope in the design it locks in', () => {
    // The note discusses every Calendar scope Google publishes, so a bare search
    // over it would match `calendar` and `calendar.events` in the reference
    // table and prove nothing. What is checked instead is the section that
    // states the decision: the note must say those two are never requested.
    const text = readFileSync(`${root}.forge/research/google-calendar.md`, 'utf8');
    const decisions = text.slice(text.indexOf('## Design decisions this note locks in'));
    console.log(`decision section: ${decisions.split('\n').length} lines`);
    expect(decisions.length).toBeGreaterThan(200);
    expect(decisions).toContain('Three scopes, none of them `calendar` or `calendar.events`.');

    // And the note's own scope inventory is larger than the three, which is what
    // makes the three a choice rather than the only thing available.
    const inventory = new Set(scopesIn('.forge/research/google-calendar.md'));
    console.log(`scopes named anywhere in the research note: ${inventory.size}`);
    expect(inventory.size).toBeGreaterThan(6);
    expect(inventory.has('https://www.googleapis.com/auth/calendar.events')).toBe(true);
  });
});
