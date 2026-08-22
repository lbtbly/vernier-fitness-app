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
});
