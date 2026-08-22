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
    const live = connections.filter((line) => line.includes('$POSTGRES_DB'));
    expect(live.length).toBeGreaterThan(0);
    for (const connection of live) {
      expect(connection, 'a live connection opened as something other than the suite role').toContain(
        `\${SUITE_ROLE}`,
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
   *   quick-log:614, 1091     REAL. The outbox depth, read out of IndexedDB
   *                           after a replay the same test proved happened.
   *   quick-log:869           REAL. `[data-state="stale"]` is drawn by the sheet
   *                           and was asserted visible fifteen lines above.
   *   quick-log:898           REAL. The loading card is drawn by the sheet and
   *                           the same test held it open to see it.
   *   quick-log:1092          REAL. `[data-just-logged]` is drawn by the day
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
   *   today.spec.ts:125       REAL. The scroll offset, on a page that scrolls.
   *   today.spec.ts:158       REAL. The dots group exists on the chart and the
   *                           line being defended is that no path joins them.
   *   today.spec.ts:225,281   REAL. Both filter a list the same run printed.
   *   today.spec.ts:374-375   REAL. Console errors and failed requests, over a
   *                           walk whose surfaces are counted and printed.
   *   notices.spec.ts:198     REAL. The route's own answer, whose `questions`
   *                           array is asserted non-empty one line away.
   *   notices.spec.ts:443     REAL. The sheet is drawn by the very click three
   *                           lines above, and it closing is what puts Undo and
   *                           Edit back in the accessibility tree.
   *   notices.spec.ts:583     REAL. The scroll offset again, and F27 turns on it.
   *   suite-privilege:67      REAL. Every refused statement is printed with the
   *                           answer Postgres gave it.
   *   this file               REAL. Both offender lists print what they walked.
   */
  it('lets no assertion claim a zero over a population the surface cannot render', () => {
    // The one that was hollow. It is gone from /health and present on Today.
    const trend = readFileSync(join(e2e, 'trend-scratch.spec.ts'), 'utf8');
    const onHealth = trend.slice(0, trend.indexOf("await openToday(page)"));
    expect(
      onHealth,
      'the notice region is counted on a page that cannot render it',
    ).not.toContain("locator('[data-notices]')");
    expect(trend).toContain("await openToday(page)");

    // And the inventory, held. A member the sweep has not read is a failure.
    const known = new Map<string, number>([
      ['quick-log.spec.ts', 10],
      ['passkey.spec.ts', 1],
      ['trend-scratch.spec.ts', 5],
      ['today.spec.ts', 6],
      ['notices.spec.ts', 3],
      ['suite-privilege.spec.ts', 1],
    ]);
    const zeroish = /toHaveCount\(0\)|\.toBe\(0\)|toEqual\(\[\]\)|toHaveLength\(0\)|not\.toBeVisible\(|toBeHidden\(/;
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
