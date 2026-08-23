import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchQuery,
  scratchSignInLink,
  testStack,
  testStackWithDemoMode,
  waitForScratch,
} from './host';

/**
 * Screen 12, and the one number on it that was about the wrong rows.
 *
 * WHY THIS IS ITS OWN FILE. The claim needs the demonstration seed LOADED,
 * because the defect is that the card counted the seed's ninety
 * Withings-shaped rows and called them readings the owner's scale delivered.
 * withings.spec.ts turns the seed off in its own beforeAll, on purpose, so that
 * a count there is a count of the import: asserting zero in that file would be
 * asserting zero over a table with no demonstration rows in it, which is the
 * shape of pass this project keeps finding. demo-seed.spec.ts has the seed and
 * no browser, and it is picked up by the WebKit project, whose base URL is the
 * OWNER'S live origin and which cannot carry a Secure cookie over loopback to
 * the scratch anyway.
 *
 * So: the scratch instance, in Chrome, with the seed on, through the shipped
 * screen. It writes nothing the seed did not already write.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-fix-craft/captures`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  // Demonstration mode ON, which is the state the owner's installation is in
  // and the only state in which the defect can be reproduced at all.
  console.log(testStackWithDemoMode('1', 'reset'));
  await waitForScratch();
  await ensureScratchOwner();
});

test.afterAll(() => {
  // Put the scratch instance back the way the rest of the suite expects it.
  testStack('reset');
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

/**
 * F42, the craft clause. "Readings stored 90" on a connection that had never
 * run an import.
 *
 * The row read mode demo, state disconnected, cursor null, rows_stored 0, with
 * no credential row anywhere, and the card printed ninety readings, because
 * the count was `where source = 'demo'` and in demonstration mode that is the
 * demonstration seed's own rows. What the number is about is readings that
 * arrived down the import path, and `external_key` is exactly that fact:
 * Withings issues an identifier per measure, the seed issues none.
 *
 * WHAT WOULD MAKE THIS GO RED: counting by source again. The population is
 * printed on the way past, so a run where the seed failed to load shows a zero
 * beside a zero in the log instead of passing quietly.
 */
test('F42. the card counts readings the import stored, not rows the seed planted', async ({
  page,
}) => {
  // The connection row is written by the screen itself, on the first render,
  // so the screen opens before anything is patched. Nothing here connects
  // anything: the row lands as mode demo, state disconnected, cursor null.
  await signIn(page);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');

  // The card draws its figures once it has something to say, so give the
  // connection the failure cause the owner's installation had. Nothing else
  // about the row changes: still demo, still disconnected, still no import.
  scratchQuery("update withings_connection set last_failure_kind = 'unreachable'");

  const seeded = Number(scratchQuery("select count(*) from measurement where source = 'demo'"));
  const withKey = Number(
    scratchQuery(
      "select count(*) from measurement where source = 'demo' and external_key is not null",
    ),
  );
  const row = scratchQuery(
    "select mode || ' ' || state || ' cursor ' || coalesce(cursor::text, 'null') || ' rows_stored ' || rows_stored from withings_connection",
  );
  console.log(
    `withings_connection: ${row}\n` +
      `measurement: ${seeded} demonstration rows, ${withKey} of them carrying a Withings identifier`,
  );
  expect(seeded).toBeGreaterThan(0);
  expect(withKey).toBe(0);

  await page.reload();
  await page.waitForLoadState('networkidle');

  const stored = (await page.locator('[data-withings-imported]').innerText()).trim();
  console.log(`the card prints "${stored}" readings stored over ${seeded} seeded rows`);
  expect(stored).toBe('0');

  await page.screenshot({ path: `${CAPTURES}/f42-readings-stored.png`, fullPage: true });
});

/**
 * F42, the two-answers clause, through the screen.
 *
 * The card read withings_connection and the list read integration_credential,
 * so one said "Last successful sync 23 Aug, 14:01" and the other said "No
 * successful sync yet", six centimetres apart on one screen. Both are read
 * here and compared with each other, rather than each being checked on its own
 * for plausibility.
 *
 * Demonstration mode is the state that exposed it: there is no credential row
 * at all, so the list had nothing to read and said so while the card had the
 * connection's own timestamp.
 */
test('F42. one fact, one answer, on both surfaces of the same screen', async ({ page }) => {
  scratchQuery(
    "update withings_connection set last_successful_sync_at = timestamptz '2026-08-23 14:01:30+02', last_failure_kind = 'unreachable'",
  );
  const credentials = scratchQuery(
    "select count(*) from integration_credential where provider = 'withings'",
  );
  console.log(`integration_credential rows for withings: ${credentials}`);

  await signIn(page);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');

  const onCard = (await page.locator('[data-withings-last-sync]').innerText()).trim();
  const inList = (
    await page.locator('[data-integration="withings"] [data-integration-last-sync]').innerText()
  ).trim();
  console.log(`card: "${onCard}"  list: "${inList}"`);

  expect(onCard).not.toMatch(/no successful sync/i);
  expect(inList).not.toMatch(/no successful sync/i);
  expect(inList).toContain(onCard);
  // And it is a time rather than a timestamp: the list printed the ISO string
  // straight out of the view, which would have read 2026-08-23T12:01:30.000Z.
  expect(inList).not.toContain('T12:01:30');
  expect(onCard).toMatch(/\d{2}:\d{2}/);
});

/**
 * F42, the test-button clause.
 *
 * `data-withings=revoked` rendered Reconnect alone, zero test buttons, where
 * demonstration, connected and expiring each render one, and
 * 12-settings-integrations.html draws Reconnect and Test together on exactly
 * that card. This counts them on the demonstration and revoked states, which
 * are the two reachable without a live client pair, and prints the count.
 */
test('F42. every state carries a test button, the unhappy ones included', async ({ page }) => {
  await signIn(page);

  for (const [name, patch] of [
    ['demo', "state = 'connected', last_failure_kind = null"],
    ['revoked', "state = 'revoked', last_failure_kind = 'reconnect'"],
  ] as const) {
    scratchQuery(`update withings_connection set mode = 'demo', ${patch}`);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const state = await page.locator('[data-withings]').getAttribute('data-withings');
    const tests = await page.locator('[data-withings] button', { hasText: /^Test$/ }).count();
    console.log(`state ${name} rendered as ${state} with ${tests} test button(s)`);
    expect(state).toBe(name);
    expect(tests).toBe(1);
  }
});
