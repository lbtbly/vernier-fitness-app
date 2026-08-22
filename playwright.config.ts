import { defineConfig, devices } from '@playwright/test';

/**
 * End to end, on the host, against the containerised app over its real HTTPS
 * origin. WebKit, because the owner's devices are an iPhone and a Mac, and
 * because a passkey ceremony that has never run in WebKit has not been tested.
 *
 * 393x852 is the iPhone 15 Pro viewport DESIGN.md measures every screen at.
 * One worker and no parallelism: there is one owner, one gate and one rate
 * limiter, and running two of anything at once would be testing the test
 * harness rather than the app.
 */
const baseURL = (process.env.APP_URL ?? 'https://lamberts-mac-mini.tailda76d6.ts.net').replace(/\/+$/, '');

export default defineConfig({
  testDir: './tests/e2e',
  // The grants first, then one reading of the owner's database at the start and
  // the same reading at the end. Every path this suite has to that database runs
  // as `vernier_suite`, which Postgres refuses every write to, so the teardown is
  // a check rather than a sweep: a count that fell is a fault.
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    ignoreHTTPSErrors: false,
    trace: 'off',
    screenshot: 'off',
    // The worker owns every fetch on this origin once it is installed, and a
    // request it makes is outside page.route's reach. A test that wants to take
    // the origin away has to be able to take it away, so the worker stands down
    // for the suite that goes through the page.
    //
    // That default hid something for a while: the offline test ran with no
    // worker at all, which proves the page's behaviour and says nothing about
    // the worker's. So the worker gets its own project below, where it is
    // allowed to install, control the page, and be measured directly.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'webkit-iphone',
      testIgnore: /focus\.spec\.ts|service-worker\.spec\.ts|quick-log\.spec\.ts|recovery\.spec\.ts|trend-scratch\.spec\.ts|launch-report\.spec\.ts/,
      use: { ...devices['Desktop Safari'], viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 },
    },
    {
      // The worker, with the worker running. Chrome because this needs a real
      // registration, a controlled page and a target whose own fetches can be
      // read back, and because what is being graded here is the worker's code
      // rather than an engine's rendering.
      name: 'chrome-worker',
      testMatch: /service-worker\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 393, height: 852 },
        serviceWorkers: 'allow',
      },
    },
    {
      // The destructive end of the suite, against the scratch instance.
      //
      // quick-log.spec.ts truncates the provenance tables between tests, and it
      // used to do that to the owner's live install behind a guard with a hole
      // in it. It runs against the scratch instance now: the same image, its
      // own database, its own container, nothing in it anybody would miss.
      //
      // recovery.spec.ts joined it for the same reason with a different write:
      // proving the recovery procedure means setting a backup password, and the
      // one it was setting was the owner's, on every run, to twelve random bytes
      // nobody kept. The suite has no UPDATE on that row any more, so the spec
      // sets the scratch instance's password instead and F18 is proven on an
      // account this suite created.
      //
      // trend-scratch.spec.ts joined it in slice 4. It needs two states the
      // owner's install cannot be put into: a database with none of the five
      // body signals in it, and a phone source whose newest sample is exactly
      // thirty-five and then exactly thirty-seven hours old. Both mean writing
      // rows, and `measurement` refuses DELETE, so they belong here.
      //
      // launch-report.spec.ts joined it after the same lesson arrived through a
      // different door. It used to be a describe block in boundary.spec.ts,
      // driven at the live origin, and every run moved device_observation on
      // the owner's install: the table C2 reads back as proof he opened Vernier
      // from his Home Screen. On 2026-08-22 two of those signals went true
      // there from a headless browser. A row the suite can author is not
      // evidence of a device, so the suite writes it here, where nobody will
      // ever read it as evidence of anything.
      //
      // Chrome, because that instance answers on plain loopback HTTP and the
      // session cookie is Secure. WebKit refuses a Secure cookie from an http
      // origin, 127.0.0.1 and localhost alike, so a WebKit run of this file
      // never gets past the sign-in screen. Chrome accepts one from a loopback
      // origin. The engine is the price of not putting a test instance on the
      // tailnet behind a second HTTPS proxy, and it is written down rather than
      // discovered: what this file proves, it proves in Chrome.
      name: 'chrome-scratch',
      testMatch: /launch-report\.spec\.ts|quick-log\.spec\.ts|recovery\.spec\.ts|trend-scratch\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        baseURL: process.env.SCRATCH_URL ?? 'http://127.0.0.1:3101',
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
      },
    },
    {
      // The layout walk, in the second engine.
      //
      // The sideways scroll it grades was reproduced in WebKit and in Chrome,
      // so it is graded in both: webkit-iphone picks this file up on its own
      // and this project runs it again in Chrome. The accessibility-tree half
      // needs the DevTools protocol, which is Chromium's, and it skips itself
      // in WebKit rather than claiming a tree it cannot read.
      name: 'chrome-layout',
      testMatch: /layout\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 393, height: 852 } },
    },
    {
      // Sequential focus navigation, which needs a browser that moves focus to
      // buttons and links. Safari on macOS only does that with Full Keyboard
      // Access turned on in System Settings, and that is a preference on the
      // owner's machine rather than a property of the app. The focus ring
      // itself is one CSS rule and is the same in every engine.
      name: 'chrome-keyboard',
      testMatch: /focus\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 393, height: 852 } },
    },
  ],
});
