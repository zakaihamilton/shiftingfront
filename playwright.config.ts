import { defineConfig, devices } from "@playwright/test";

const chromePath = process.env.PLAYWRIGHT_CHROME_PATH;
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
    baseURL: "http://127.0.0.1:3100",
    headless: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: chromiumLaunchOptions } },
    {
      name: "iphone-touch",
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    { name: "android-touch", testMatch: /responsive\.spec\.ts/, use: { ...devices["Pixel 5"], launchOptions: chromiumLaunchOptions } },
  ],
  webServer: {
    command: "NEXT_PUBLIC_E2E_MUTE_MUSIC=1 NEXT_PUBLIC_E2E_MUTE_SFX=1 yarn build && PORT=3100 HOSTNAME=127.0.0.1 yarn start",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
