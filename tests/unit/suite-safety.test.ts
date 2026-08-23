import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The suite cannot destroy the owner's data, read off the suite.
 *
 * WHAT THIS USED TO ASSERT AND WHY IT WAS NOT ENOUGH. It read one helper in
 * host.ts, checked it set `default_transaction_read_only`, and then greped every
 * spec for TRUNCATE, DELETE, INSERT and UPDATE, attributing each to the nearest
 * helper call above it. Postgres really did refuse everything that helper
 * carried. The check was still holding one door in a building with several: a
 * spec that opened its own `docker compose exec db psql -d "$POSTGRES_DB"` and
 * handed it a TRUNCATE passed all four assertions and all 83 unit tests, because
 * a statement with no `query(` before it was skipped as prose. And
 * `scripts/recovery.sh` was a second read-write connection into the same
 * database that this file did not model at all.
 *
 * SO THE LINE IS NOT HELD HERE ANY MORE. It is held by a missing grant:
 * `vernier_suite` has SELECT, an INSERT on the one-time sign-in grants, an
 * INSERT on the append-only auth log, and nothing else, and
 * tests/e2e/suite-privilege.spec.ts proves that by asking Postgres. A helper
 * nobody has written yet inherits that refusal without knowing either file
 * exists, which is the property a grep can never have.
 *
 * What is left for a static check is the one thing a grant cannot cover: the
 * database container's bootstrap role is a superuser, and anyone who can run
 * `docker compose exec db` can become it. No privilege closes that; it is the
 * same access the owner has. So this file asserts SHAPE rather than statements:
 * one file in the suite may reach for docker, psql or recovery.sh, and it is
 * host.ts, where every connection is written down and every one of them names
 * the role. A spec that opens its own is a failing unit test whatever it then
 * does, and the plant that walked past the old version fails on its first line.
 */
const e2e = fileURLToPath(new URL('../e2e/', import.meta.url));
const scripts = fileURLToPath(new URL('../../scripts/', import.meta.url));
const SUITE_ROLE = 'vernier_suite';

function specs(): Array<[string, string]> {
  return readdirSync(e2e)
    .filter((name) => name.endsWith('.ts') && name !== 'host.ts' && name !== 'fixtures.ts')
    .map((name) => [name, readFileSync(join(e2e, name), 'utf8')]);
}

const host = readFileSync(join(e2e, 'host.ts'), 'utf8');
const playwrightConfig = readFileSync(
  fileURLToPath(new URL('../../playwright.config.ts', import.meta.url)),
  'utf8',
);

/** One of playwright.config.ts's own file patterns, as a regular expression. */
function pattern(around: RegExp, source: string): RegExp {
  const found = around.exec(source);
  if (!found) throw new Error(`playwright.config.ts has no ${around.source}`);
  return new RegExp(found[1]);
}
const roleScript = readFileSync(join(scripts, 'suite-role.sh'), 'utf8');
const recoveryScript = readFileSync(join(scripts, 'recovery.sh'), 'utf8');

describe('the suite against the owner\'s installation', () => {
  it('reaches the owner\'s database only as the role that cannot write it', () => {
    // Every psql invocation in the suite, and each one names the suite role. A
    // connection as $POSTGRES_USER is the bootstrap superuser and would be
    // refused by nothing at all.
    const connections = [...host.matchAll(/psql -U (\S+) -d ([^\s]+)/g)].map(
      (match) => `${match[1]} ${match[2]}`,
    );
    expect(connections.length).toBeGreaterThan(0);
    // And the name behind that interpolation. Every assertion below reads the
    // literal `${SUITE_ROLE}`, so host.ts could rebind it to the owner role and
    // the whole file would still be green.
    expect(host, 'host.ts no longer binds the suite role to vernier_suite').toContain(
      `export const SUITE_ROLE = '${SUITE_ROLE}'`,
    );
    const live = connections.filter((line) => line.includes('$POSTGRES_DB'));
    expect(live.length).toBeGreaterThan(0);
    for (const connection of live) {
      expect(connection, 'a live connection opened as something other than the suite role').toContain(
        '${SUITE_ROLE}',
      );
    }
    // The bootstrap superuser is still how the SCRATCH database is written, and
    // that is the point of the scratch database. What it may never be is a
    // connection to the owner's.
    expect(host).not.toMatch(/psql -U "\$POSTGRES_USER" -d "\$POSTGRES_DB"/);
  });

  it('hands scripts/recovery.sh the same role, in the one place it is called', () => {
    // recovery.sh drives its own connection into the app container. Without the
    // role it connects as the database owner, which is how `password` came to
    // overwrite the owner's backup password on every run.
    const call = host.slice(host.indexOf('export function recovery('), host.indexOf('export function scratchRecovery('));
    expect(call).toContain('RECOVERY_ROLE: SUITE_ROLE');
    // And the script carries it into the container from one place, so a command
    // added to it later cannot arrive without one.
    expect(recoveryScript).toContain('RECOVERY_ROLE=${RECOVERY_ROLE}');
    expect(recoveryScript).toContain('CONNECT_SCRIPT');
    const connections = [...recoveryScript.matchAll(/new pg\.default\.Client\(/g)];
    expect(connections.length, 'every command in recovery.sh connects through the one prelude').toBe(1);
  });

  it('lets no spec open a connection, a container or the recovery script of its own', () => {
    // The shape the plant took: `docker compose exec db psql -d "$POSTGRES_DB"`
    // with a TRUNCATE, written straight into a spec. It is refused here by
    // shape, before anyone asks what statement it carried, because the
    // bootstrap superuser inside that container is refused by no grant. The
    // driver is named too: a spec that opened its own pg client would be past
    // the role the same way, and past docker as well.
    const reaches =
      /\b(docker|psql|recovery\.sh|pg_dump|pg_restore)\b|from 'pg'|require\('pg'\)|new (pg\.default\.|pg\.)?Client\(/;
    const offenders: string[] = [];
    for (const [name, source] of specs()) {
      source.split('\n').forEach((line, index) => {
        if (line.trim().startsWith('*') || line.trim().startsWith('//')) return;
        if (reaches.test(line)) offenders.push(`${name}:${index + 1}  ${line.trim()}`);
      });
    }
    expect(offenders, 'a spec reaching past tests/e2e/host.ts for a database or a container').toEqual([]);
  });

  it('keeps the destructive helper pointed at the scratch database by name', () => {
    expect(host).toContain('export function resetScratchProvenance()');
    expect(host).not.toContain('export function resetProvenance(');
    const reset = host.slice(host.indexOf('export function resetScratchProvenance()'));
    expect(reset).toContain('scratchQuery(');
    expect(reset).toContain('SCRATCH_CONTAINER');
    expect([...host.matchAll(/-d vernier_scratch/g)].length).toBeGreaterThan(0);
  });

  it('lets no spec report a launch at the owner\'s install', () => {
    // The write that made two owner-blocked rubric lines read as met. C2 reads
    // device_observation back as proof the owner opened Vernier from his iPhone
    // Home Screen, and on 2026-08-22 standalone_seen and wake_lock_available
    // both went true on his install from a headless browser on this Mac. The
    // route refuses a driven browser now; this is the second lock, and it is
    // the one that stops a spec being pointed at that install in the first
    // place.
    //
    // Read off playwright.config.ts by asking its own patterns, not by matching
    // the text of them: the scratch project is the only one whose baseURL is not
    // the live origin, so a spec that posts a launch must be matched by it and
    // ignored by the project that runs everything else.
    const scratchProject = playwrightConfig.slice(playwrightConfig.indexOf("name: 'chrome-scratch'"));
    expect(scratchProject).toContain('baseURL: process.env.SCRATCH_URL');
    const scratchMatch = pattern(/testMatch: \/(.+?)\/,/, scratchProject);
    const liveIgnore = pattern(/testIgnore: \/(.+?)\/,/, playwrightConfig);

    const reporters = specs()
      .filter(([, source]) => source.includes('/api/diagnostics/launch'))
      .map(([name]) => name);
    expect(reporters.length, 'no spec posts a launch report at all').toBeGreaterThan(0);

    for (const name of reporters) {
      expect(scratchMatch.test(name), `${name} posts a launch report and the scratch project does not run it`).toBe(true);
      expect(liveIgnore.test(name), `${name} posts a launch report and the live project does not ignore it`).toBe(true);
      const source = readFileSync(join(e2e, name), 'utf8');
      expect(source, `${name} posts a launch report at the live origin`).not.toContain('baseUrl()');
    }
  });

  it('lets no spec open a browsing context outside the harness that holds the launch report', () => {
    // THE SECOND HALF OF THE LOCK ABOVE, AND THE HALF THAT DOES NOT DEPEND ON A
    // SPEC MENTIONING THE ENDPOINT. The shipped client raises a launch report
    // from the root layout, so every page this suite opens at the live origin
    // raises one. That was refused by the route on two witnesses, and the
    // user-agent witness never fires for WebKit: Playwright's WebKit sends a
    // genuine Safari user agent, so the whole refusal rested on one
    // client-supplied boolean and one addInitScript line put it back.
    //
    // So the report does not leave this machine. tests/e2e/fixtures.ts fulfils
    // it in the harness for every context whose target is not the scratch
    // instance, and a spec gets that by importing `test`. What is asserted here
    // is the shape that makes it unavoidable: no spec imports `test` from
    // anywhere else, and no spec opens a context of its own around it.
    const fixtures = readFileSync(join(e2e, 'fixtures.ts'), 'utf8');
    expect(fixtures).toContain("'**/api/diagnostics/launch'");
    expect(fixtures).toContain('route.fulfill(');
    expect(fixtures).toContain('scratchUrl');

    const offenders: string[] = [];
    for (const [name, source] of specs()) {
      if (name.endsWith('.spec.ts') && /from '@playwright\/test'/.test(source)) {
        offenders.push(`${name} imports test from @playwright/test`);
      }
      if (/browser\.newContext\(/.test(source)) offenders.push(`${name} opens a context of its own`);
      // A spec may need a second engine, and notices.spec.ts does. It gets one
      // through `inEngine`, which routes the context through the same hold; a
      // raw launch would be outside it.
      if (/\.launch\(/.test(source)) offenders.push(`${name} launches a browser of its own`);
      // The hold is installed on the CONTEXT, so `page.unrouteAll` cannot
      // reach it and a blanket `context.route('**/*')` that unroutes its own
      // pattern afterwards never touches it. What is refused is clearing the
      // context's routes, or removing this one by name.
      if (/context\.unrouteAll\(|unroute\([^)]*diagnostics\/launch/.test(source)) {
        offenders.push(`${name} removes the route that holds the launch report`);
      }
    }
    expect(offenders, 'a spec outside the harness that holds the launch report').toEqual([]);

    // And every spec is reached by it, rather than most of them.
    const files = specs().filter(([name]) => name.endsWith('.spec.ts'));
    const wired = files.filter(([, source]) => source.includes("from './fixtures'"));
    expect(wired.map(([name]) => name)).toEqual(files.map(([name]) => name));
  });

  it('grants that role no way to edit or remove anything, anywhere', () => {
    // Read off the script that writes the grants. What the database actually
    // holds is asserted in tests/e2e/suite-privilege.spec.ts, which asks it.
    const grants = [...roleScript.matchAll(/^grant (\w+)(?: on all tables in schema public| on ([\w, ]+)) to/gim)].map(
      (match) => [match[1].toLowerCase(), (match[2] ?? 'all tables').trim()] as const,
    );
    expect(grants.length).toBeGreaterThan(0);
    for (const [privilege, on] of grants) {
      expect(
        ['select', 'insert', 'usage', 'connect'],
        `${privilege} on ${on} is more than this role may hold`,
      ).toContain(privilege);
      if (privilege === 'insert') {
        expect(['recovery_grant', 'auth_attempt'], `an INSERT granted on ${on}`).toContain(on);
      }
    }
    expect(roleScript).toMatch(/revoke all on all tables in schema public from/i);
    expect(roleScript).not.toMatch(/^grant (update|delete|truncate|all)/im);
    // The one function it may execute, and the prefix that bounds it.
    expect(roleScript).toContain('grant execute on function suite_forget_passkey(text)');
    expect(roleScript).toContain("not like '${CREDENTIAL_MARKER}%'");
    expect(roleScript).toContain('CREDENTIAL_MARKER=vernierSuite');
  });
  /**
   * THE HOLLOW ASSERTION, SWEPT AND HELD SWEPT.
   *
   * `trend-scratch.spec.ts:167` read `expect(page.locator('[data-notices]')
   * .count()).toBe(0)` on `/health`. `NoticeRegion` is rendered by
   * `src/app/(shell)/page.tsx` and by nothing else, so the count was 0 whatever
   * the staleness was: a zero over an empty population, which A4's first
   * standing rule forbids, and it reads identically to a real check. That is the
   * property that makes it dangerous and it is why the ruling asked for a sweep
   * rather than a deletion.
   *
   * The whole class is inventoried below and each one carries a verdict. Every
   * assertion of a zero count, a not-visible or an empty array was read against
   * one question: can the surface it is asked on render the subject at all? A
   * new one arriving in slice 5 or slice 13 fails this test until somebody
   * writes down which kind it is, which is the only version of a sweep that
   * survives eleven more slices of coverage.
   *
   *   quick-log:413           REAL. `.card.error[data-state="error"]` is drawn by
   *                           the correction screen itself on a 404 from the
   *                           route, on the very screen being walked, and its
   *                           absence is the difference between one edit landing
   *                           and three.
   *   quick-log:557, 749      REAL. `saved` is a field of the route's own JSON
   *                           answer, and the same answer's `questions` array is
   *                           asserted non-empty beside it.
   *   quick-log:597, 632      REAL. Undo is drawn by the just-logged row while
   *                           the entry is queued, and the same locator is
   *                           asserted visible earlier in the same test.
   *   quick-log:614, 1373     REAL. The outbox depth, read out of IndexedDB
   *                           after a replay the same test proved happened.
   *   quick-log:1072          REAL. `[data-state="stale"]` is drawn by the sheet
   *                           and was asserted visible fifteen lines above.
   *   quick-log:1101          REAL. The loading card is drawn by the sheet and
   *                           the same test held it open to see it.
   *   quick-log:1374          REAL. `[data-just-logged]` is drawn by the day
   *                           card and the same test watched it appear.
   *   passkey.spec.ts:77      REAL. "No passkey is registered yet." is drawn by
   *                           `/settings`, and the branch that asserts its
   *                           absence asserts one credential row in its place,
   *                           so the population is printed either way.
   *   trend-scratch:137       REAL. Figures reading zero anywhere on a screen
   *                           whose five absent signals are each printed first.
   *   trend-scratch:169,204   REAL. `.src.stale` on /health, which renders source
   *                           chips, and the same locator carries the age two
   *                           states earlier in the same test.
   *   trend-scratch:189       MOVED. The one hollow member. It counted
   *                           `[data-notices]` on /health, where `NoticeRegion`
   *                           is never rendered, so it could not fail. It is
   *                           asked on Today now, with the quiet-source count
   *                           printed beside it.
   *   trend-scratch:201       REAL. The age of the newest sample, read back out
   *                           of the database after landing it.
   *   today.spec.ts:169       REAL. The scroll offset, on a page that scrolls.
   *   today.spec.ts:202       REAL. The dots group exists on the chart and the
   *                           line being defended is that no path joins them.
   *   today.spec.ts:358       REAL. Dots inside a hatched band, and the loop it
   *                           sits in runs once per band the chart drew. The
   *                           band count is asserted equal to the runs of
   *                           absence in the chart's own table one screen above,
   *                           and the table is itself asserted against a count
   *                           of days taken from Postgres, so an empty loop is a
   *                           chart with nothing to hatch and the run says so.
   *   today.spec.ts:436       REAL. Filters a list the same run printed.
   *   today.spec.ts:529-530   REAL. Console errors and failed requests, over a
   *                           walk whose surfaces are counted and printed.
   *   notices.spec.ts:246     REAL. The route's own answer, whose `questions`
   *                           array is asserted non-empty one line away.
   *   notices.spec.ts:496     REAL. The loading card is drawn by the sheet, and
   *                           this is the wait that makes the waist typing below
   *                           mean anything: the snapshot read fills that field,
   *                           so a value typed while the card is still up is
   *                           typed into something about to be re-rendered. The
   *                           same card is held open and asserted visible in
   *                           quick-log.spec.ts, on the same component.
   *   notices.spec.ts:564     REAL. The sheet is drawn by the very click three
   *                           lines above, and it closing is what puts Undo and
   *                           Edit back in the accessibility tree.
   *   notices.spec.ts:705     REAL. The scroll offset again, and F27 turns on it.
   *   ingest.spec.ts:192      REAL. `duplicates` is a field of the route's own
   *                           answer, on the first arrival of a batch into an
   *                           emptied table, and the `accepted` count beside it
   *                           is asserted equal to the fixture's own row count.
   *                           A zero here is the claim that nothing was already
   *                           stored, over a population the same line prints.
   *   ingest.spec.ts:219      REAL. `accepted` on the second, third and fourth
   *                           run of an overlapping window. `duplicates` is
   *                           asserted greater than zero on the same response,
   *                           and the row counts before and after all four runs
   *                           are printed and compared. A run that had reached
   *                           nothing at all would fail on the duplicates.
   *   notices.spec.ts:583     REAL. The scroll offset again, and F27 turns on it.
   *   nutrition:150, 181      REAL. `[data-card="preview"]` is drawn by the very
   *                           same component whenever the verdict is `allowed`,
   *                           and the same locator is asserted VISIBLE two tests
   *                           earlier and again three lines later, after the
   *                           compliant rate is accepted. Its absence is the
   *                           whole of the refusal.
   *   nutrition:154           REAL. `[data-control="confirm-below-floor"]` is a
   *                           control this component really renders, on the
   *                           blocked card, and the test below asserts it
   *                           VISIBLE there. Asserting it absent on the
   *                           rate-refusal card is the line: a refused rate has
   *                           no confirmation that unlocks it and a blocked
   *                           floor does.
   *   nutrition:185           REAL. A count of target rows, taken after a walk
   *                           that typed a whole body into the form and got a
   *                           block, and the test above it stores a row through
   *                           the same screen and asserts the count is 1.
   *   nutrition:398           REAL. F84's zero, and the same console line prints
   *                           the ingredient lines walked and the shellfish
   *                           recipes the catalogue holds, both asserted above
   *                           zero on every generation.
   *   shopping:208            REAL. `.boxtap` is the tick control every bought
   *                           line on that screen renders, and the same test
   *                           asserts the deducted row itself visible with its
   *                           quantity struck through. A deducted line has
   *                           nothing to tick, which is why the control is gone
   *                           and the row is not.
   *   suite-privilege:67      REAL. Every refused statement is printed with the
   *                           answer Postgres gave it.
   *   withings.spec.ts:109    REAL. Rows whose source is not `demo`, counted
   *                           over a table the same three lines print the whole
   *                           source census of. A hundreds-strong population is
   *                           asserted immediately above it.
   *   withings.spec.ts:229    REAL. The blood pressure probe row, counted after
   *                           an INSERT the same test printed the refusal of.
   *                           The zero is the constraint holding, and the
   *                           constraint's own message is asserted beside it.
   *   withings.spec.ts:294    REAL. `.skel` is drawn by the Withings card and
   *                           by the shell's loading state, on the screens being
   *                           walked, and the render time is printed beside it.
   *   withings.spec.ts:410    REAL. Open questions, counted after the same test
   *                           asserted exactly one open and then answered it
   *                           through the shipped control.
   *   withings.spec.ts:422    REAL. The notice region on Today draws this line,
   *                           and the same test watched it appear on the settings
   *                           card before the answer closed it.
   *   labs-scratch:109        REAL. The review holding is counted non-zero
   *                           twelve lines above, on the same instance, before
   *                           the abandon that is expected to take it to zero.
   *   labs-scratch:130,137    REAL, and they are the point of the slice. Both
   *                           filter a list the same run counted and printed:
   *                           `writes.length` is asserted greater than zero and
   *                           the control count is logged, so an empty screen
   *                           fails before either filter is reached. What is
   *                           being defended is that NO control on a screen full
   *                           of controls writes more than one row.
   *   labs-scratch:369,370    REAL. The refusal branch of F65, and both zeros
   *                           sit under an `expect(refused).toBeVisible()` that
   *                           proves the surface rendered the refusal. The
   *                           population is the upload that was just made.
   *   labs-scratch:541        REAL. It filters a list of every visible control
   *   labs-scratch F65        GONE, and it was the one hollow pair in this file.
   *                           The refusal branch asserted `measurementCount()`
   *                           was 0 and `scratchLabFiles()` was `[]`, which
   *                           reads as "nothing was stored" and is not what it
   *                           measured: this spec is serial and F59, F61 and
   *                           both F62 tests store rows and leave documents on
   *                           the volume before F65 runs, so the two zeros could
   *                           only ever hold when the tests before them had done
   *                           nothing. Both now compare against the counts read
   *                           at the top of the same test, which is the claim
   *                           that was meant: this upload stored nothing new and
   *                           took its own bytes with it. Two members left the
   *                           class and the inventory below went from 6 to 4.
   *   labs-scratch:511        REAL. It filters a list of every visible control
   *                           on the screen, and the rows and control groups are
   *                           counted and printed at each of three viewports on
   *                           the lines above.
   *   this file               REAL. Both offender lists print what they walked.
   *
   *   Slice 8 added three files and every member of the class in them was read
   *   against the same question before it was written down here.
   *
   *   console-walk:168        REAL. The outbox depth out of IndexedDB, after a
   *                           quick-log write and two logged sets the same test
   *                           watched land. The queue was demonstrably not
   *                           empty a moment earlier.
   *   console-walk:186,187    REAL. C9's two zeros, and the run prints the
   *                           surfaces it walked, the requests it saw and the
   *                           responses it counted beside them, with a floor
   *                           asserted on each so an empty walk fails.
   *   session-player:199      REAL. Every dialog raised during a driven full
   *                           session is recorded by a `page.on('dialog')`
   *                           listener attached before the first tap, and the
   *                           session is asserted to have reached its done
   *                           phase, so the recording covers a session that
   *                           really ran.
   *   session-player:203      REAL. `dialog[open]` and `[role=alertdialog]` on
   *                           the player, which draws a `role=dialog` sheet of
   *                           its own two tests earlier: the surface can render
   *                           the subject and does.
   *   train-week:330          REAL. The squat's absence from the progression
   *                           cards, on a screen that renders the push-up's
   *                           card in the assertion two lines above it. The
   *                           seeded histories are printed first.
   *   train-week:455,478      REAL. Rows the two refusal probes left behind,
   *                           counted after Postgres printed its refusal, on a
   *                           table the same file lists thirty rows of.
   *
   *   The suite-stabilising dispatch added one, and it was read against the
   *   same question before it was written down here. The line numbers of every
   *   member above were re-read off the files in the same pass, because a
   *   pointer into the wrong line is worse than no pointer at all.
   *
   *   train-week:223          REAL. Decision controls that sit outside any
   *                           proposal row, on a screen whose rows and controls
   *                           are both counted and printed on the two lines
   *                           above it and asserted to be three per row. The
   *                           surface renders `[data-decision]` thirteen times
   *                           on a four-session week, so a zero here is the
   *                           claim that none of them escaped its card and not
   *                           the claim that the screen was empty.
   *   The craft-defect pass added one member and one file, and both were read
   *   against the same question before they were written down.
   *
   *   session-player           REAL. Tab bar elements on the session player,
   *   (the tab bar count)      which screen 07 draws none of. The same test
   *                           counts the bar's five links on /train first and
   *                           asserts that count, so a build where the bar
   *                           never renders anywhere fails on the line above
   *                           rather than passing on this one. That is exactly
   *                           the trap: "nothing covers Set done" is also true
   *                           of a screen with no tab bar in the product at all.
   *   nutrition               REAL. The computed-energy flag on the food whose
   *   (the computed flag)      energy Anses published, and the same selector is
   *                           asserted VISIBLE on the computed food twenty
   *                           lines above in the same test, on the same
   *                           instance. The surface can render the subject and
   *                           did; the claim is that this food does not wear
   *                           the other food's marker.
   *   settings-integrations   REAL. Measurements carrying the identifier
   *   (external_key)          Withings issues, over a population of
   *                           demonstration rows counted and asserted greater
   *                           than zero two lines above, with the connection
   *                           row printed beside it. The zero IS the claim: the
   *                           card counted the seed's ninety rows as readings
   *                           the scale delivered.
   *   Slice 10 added one file and every member of the class in it was read
   *   against the same question before it was written down here.
   *
   *   meals:233               REAL. `ai_call` at zero, on an instance where the
   *                           same test has just posted a real photograph at the
   *                           real endpoint and read back a 403. The table is
   *                           written by every call that succeeds, and the next
   *                           test in the file proves it non-zero, so an empty
   *                           table here is a refusal and not an absent feature.
   *   meals:298,299           REAL, and they are the point of F93. The subject
   *                           is a file the same run put GPS into: the bytes
   *                           going in are scanned first and asserted to CARRY
   *                           a location, printed with their marker list, and
   *                           only then is the stored file asserted to carry
   *                           none. A scanner that found nothing at all fails
   *                           twenty lines earlier.
   *   meals:320               REAL. `meal_entry_item` after an estimate was
   *                           abandoned, and the run prints the entry count
   *                           before and after beside the `ai_call` count,
   *                           which is asserted GREATER than zero on the same
   *                           line. The screen that would have written those
   *                           rows was rendered and walked.
   *   meals:708               REAL. Refused ledger rows that carry a cost or an
   *                           output token, on a table the same test prints in
   *                           full and asserts contains a refusal. The subject
   *                           is a filter over a population that is proven
   *                           non-empty two lines above.
   *   Slice 11 added one file and all three members of the class in it were read
   *   against the same question before they were written down here.
   *
   *   calendar:204,205        REAL, and they are the point of the slice. The
   *                           events in the demonstration calendar and the rows
   *                           in the write log, counted WHILE THE CONFIRM DIFF
   *                           IS OPEN. Both tables can hold rows and do a few
   *                           lines later, in the same test, after Apply: the
   *                           run prints the diff's own row count first and then
   *                           the event listing afterwards, so the zero is
   *                           bracketed by a population on each side.
   *   calendar:462            REAL. Stored Google credentials after an invalid
   *                           grant. The same table held exactly one for that
   *                           provider earlier in the same run, asserted at
   *                           f101 step one, and the test prints the connection
   *                           row beside the count.
   *   Slice 12 added two files and every member of the class in them was read
   *   against the same question before it was written down here.
   *
   *   review:169              REAL. Requests the email preview made, recorded by
   *                           a `page.on('request')` listener attached before the
   *                           reload, and the document itself is in the list the
   *                           filter removes, so an empty page would fail the
   *                           filter rather than pass it. The point of the line
   *                           is that an email client fetches nothing.
   *   review:214              REAL. Denylist matches over the rendered screen,
   *                           and the same line asserts the copy is over three
   *                           hundred characters first, so a screen that failed
   *                           to render cannot answer this zero.
   *   push:291,297            REAL. The reminder row that was just closed, on a
   *                           list the same test counted above zero and took the
   *                           first item from. The `count === 0` branch above
   *                           returns before either line is reached and asserts
   *                           the styled empty state instead, so neither zero is
   *                           ever answered by an empty list.
   *   push:317                REAL. Controls under 44 px, filtered out of every
   *                           button, link and input the notifications screen
   *                           renders. That screen carries eleven diagnostic
   *                           rows, four category switches and two time fields,
   *                           and the same expression logs the count it walked.
   *   Slice 13 added one file with twelve members, and every one was read
   *   against the same question before it was written down here. Eight of them
   *   absence-scratch:1        REAL, and it is the whole of what that file measures.
   *                           Daily dots falling inside the hatched band, on a
   *                           chart whose own hidden table is read first and
   *                           printed: the day count, the readings in it and the
   *                           runs of absence are all asserted non-empty before
   *                           this line is reached, and the dot count is asserted
   *                           equal to the reading count on the line above. A
   *                           chart that drew nothing fails four assertions
   *                           before this one.
   *
   *   Slice 13 added one file with eleven members, and every one was read
   *   against the same question before it was written down here. Seven of them
   *   are a different shape from the rest of this inventory and are worth
   *   naming: an EXIT CODE is not a count over a population, it is a verdict a
   *   process reached, and each one has that process's whole output printed
   *   beside it and asserted to contain a specific sentence.
   *
   *   backup:105,156,212      REAL. `verify` and `restore` exiting 0, each with
   *   backup:310,315,597      its stdout printed and asserted to contain the
   *                           sentence the command prints when it has actually
   *                           done the work: "every chunk authenticated and
   *                           every member matched its digest", "every table
   *                           came back with the count the archive recorded",
   *                           "every table holds exactly what the file carried".
   *                           A command that did nothing exits 2 with a usage
   *                           message and fails the sentence.
   *   backup:164              REAL, and it arrived with F125's fix. `frames`
   *                           exiting 0, printing the chunk layout of the very
   *                           archive the three corruptions are then made from,
   *                           and the same block asserts the count it parsed is
   *                           at least two. It IS the population beside those
   *                           three failures: the swap was refused on any
   *                           archive holding fewer than four chunks, every
   *                           archive this instance writes holds two or three,
   *                           and nothing in the run printed how many there
   *                           were, so the refusal read as a test failure for a
   *                           day.
   *   backup:172              REAL. `corrupt` exiting 0, and the file it wrote
   *                           is verified below, where it must FAIL with the
   *                           code the corrupt command printed as the one it
   *                           expects.
   *   backup:185              INVERTED, and it is F125 itself: `not.toBe(0)` on
   *                           the exit code of a verification that has to
   *                           refuse. The pattern above matches the `.toBe(0)`
   *                           inside it; the assertion is the opposite one.
   *   backup:130              REAL, and it is F124's trace. No encryption or
   *                           dump binary in the image, over a PATH whose
   *                           executable count is printed on the same line and
   *                           asserted above fifty. A zero over an empty PATH
   *                           fails on the count.
   *   backup:376,377          REAL, and they are the point of F131. Both tables
   *                           of the deleted category, counted after the
   *                           deletion, with the SAME COUNTS TAKEN AND PRINTED
   *                           BEFORE IT and asserted greater than zero. The
   *                           deletion row is then read back and asserted to
   *                           carry the before count, so the zero is bracketed
   *                           by the population on both sides.
   *
   *   The line numbers above are where each member sat when it was last read.
   *   They drift whenever a spec is edited and the sweep below counts members
   *   rather than reading them, which is why the count is the thing that fails:
   *   a member nobody has written down here stops the suite until somebody has.
   */
  it('lets no assertion claim a zero over a population the surface cannot render', () => {
    // The one that was hollow. It is gone from /health and present on Today.
    const trend = readFileSync(join(e2e, 'trend-scratch.spec.ts'), 'utf8');
    const onHealth = trend.slice(0, trend.indexOf('await openToday(page)'));
    expect(
      onHealth,
      'the notice region is counted on a page that cannot render it',
    ).not.toContain("locator('[data-notices]')");
    expect(trend).toContain('await openToday(page)');

    // And the inventory, held. A member the sweep has not read is a failure.
    const known = new Map<string, number>([
      ['quick-log.spec.ts', 10],
      ['passkey.spec.ts', 1],
      ['trend-scratch.spec.ts', 5],
      ['today.spec.ts', 6],
      ['notices.spec.ts', 4],
      ['ingest.spec.ts', 2],
      ['suite-privilege.spec.ts', 1],
      ['withings.spec.ts', 5],
      ['labs-scratch.spec.ts', 4],
      ['nutrition.spec.ts', 6],
      ['shopping.spec.ts', 1],
      ['console-walk.spec.ts', 3],
      ['session-player.spec.ts', 3],
      ['train-week.spec.ts', 4],
      ['settings-integrations.spec.ts', 1],
      ['meals.spec.ts', 4],
      ['calendar.spec.ts', 3],
      ['review.spec.ts', 2],
      ['push.spec.ts', 3],
      ['backup.spec.ts', 12],
      ['absence-scratch.spec.ts', 1],
    ]);
    // `toHaveCount(0, { timeout: 3_000 })` was invisible to this pattern until
    // slice 5 wrote one: the closing paren was required right after the zero, so
    // BOUNDING an assertion took it straight out of the sweep. A checker with a
    // shape it cannot see is the same defect the sweep exists to catch, so a
    // comma after the zero counts now.
    const zeroish = /toHaveCount\(0\s*[,)]|\.toBe\(0\)|toEqual\(\[\]\)|toHaveLength\(0\)|not\.toBeVisible\(|toBeHidden\(/;
    const counted: string[] = [];
    for (const [name, source] of specs()) {
      if (!name.endsWith('.spec.ts')) continue;
      const found = source.split('\n').filter((line) => zeroish.test(line)).length;
      if (found === 0) continue;
      counted.push(`${name} ${found}`);
      expect(
        known.get(name),
        `${name} carries ${found} assertions of the hollow-assertion class and the sweep recorded ${known.get(name) ?? 'none'}. Read each one, write down whether the surface can render the subject, and update the inventory above.`,
      ).toBe(found);
    }
    // The population this walk covered, printed beside its own zero.
    expect(counted.length, `the sweep found nothing to read, which is not a pass: ${counted.join(', ')}`).toBeGreaterThan(0);
  });
});
