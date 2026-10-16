import { chromium, expect, test } from "@playwright/test";
import { waitForBattlefield } from "./battlefieldReady";

test("launches the first battlefield offline after installing from the menu", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Chromium service worker coverage");
  // A loopback subdomain is a secure context while exercising the production
  // worker, whose development bypass only applies to localhost/127.0.0.1.
  const origin = "http://offline.shiftingfront.localhost:3100";
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROME_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {}),
    args: ["--mute-audio", "--host-resolver-rules=MAP offline.shiftingfront.localhost 127.0.0.1"],
  });
  try {
    const context = await browser.newContext({ baseURL: origin });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("button", { name: "NEW GAME" })).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
      });
    });
    await context.setOffline(true);
    await page.goto("/play?seed=0421&mission=0");
    await waitForBattlefield(page);
  } finally { await browser.close(); }
});
