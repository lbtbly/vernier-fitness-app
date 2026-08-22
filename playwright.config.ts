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
      testIgnore: /focus\.spec\.ts|service-worker\.spec\.ts/,
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
