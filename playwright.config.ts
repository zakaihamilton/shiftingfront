import { defineConfig, devices } from "@playwright/test";

const chromePath = process.env.PLAYWRIGHT_CHROME_PATH;
const port = Number(process.env.PLAYWRIGHT_PORT || 3100);
const baseURL = `http://127.0.0.1:${port}`;
const chromiumLaunchOptions = {
  args: ["--mute-audio"],
  ...(chromePath ? { executablePath: chromePath } : {}),
};

export default defineConfig({
  testDir: "./tests/e2e",
  // The app and its production web server are shared by all projects. Running
  // individual tests from the same file concurrently causes intermittent
  // navigation and hydration races on local runs, especially for WebKit.
  // Keep file-level execution serialized with fullyParallel: false, and allow
  // 2 file-level workers to utilize both runner vCPUs.
  fullyParallel: false,
  testIgnore: process.env.PLAYWRIGHT_SKIP_PERFORMANCE === "1" ? /performance\.spec\.ts/ : undefined,
  workers: 2,
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05,
      animations: "disabled",
    },
  },
  use: {
    baseURL,
    headless: true,
  },
  projects: [
    { name: "webkit-saves", testMatch: /persistence\.spec\.ts/, use: { ...devices["Desktop Safari"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: chromiumLaunchOptions } },
    {
      name: "iphone-touch",
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    { name: "android-touch", testMatch: /responsive\.spec\.ts/, use: { ...devices["Pixel 5"], launchOptions: chromiumLaunchOptions } },
  ],
  webServer: {
    command: `NEXT_PUBLIC_E2E_MUTE_MUSIC=1 NEXT_PUBLIC_E2E_MUTE_SFX=1 NEXT_PUBLIC_E2E_MULTIPLAYER=1 yarn build && PORT=${port} HOSTNAME=127.0.0.1 yarn start`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
