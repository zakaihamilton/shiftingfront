import { expect, test } from "@playwright/test";
import { waitForBattlefieldReady } from "./battlefieldReady";
import { createMission } from "../../lib/sim/api";

test("new campaign carries its optional challenge from briefing into the battlefield", async ({ page }) => {
  const challenge = createMission({ seed: 0, missionIndex: 0, gameplayRulesVersion: 2 }).runtime!.secondary.find(objective => objective.priority === "optional")!;
  await page.goto("/");
  await page.getByRole("button", { name: "NEW GAME" }).click();
  await page.getByLabel("Four digit campaign code").fill("0000");
  await page.getByTestId("deploy-screen").getByRole("button", { name: "Start" }).click();
  await expect(page.getByTestId("briefing-screen")).toContainText(`Optional: ${challenge.label}`);
  await page.getByRole("button", { name: "Launch" }).click();
  await waitForBattlefieldReady(page);
  await page.getByRole("button", { name: "Expand mission directive" }).click();
  await expect(page.getByRole("region", { name: "Optional objectives" })).toContainText(challenge.label);
  await expect(page.getByRole("region", { name: "Optional objectives" })).toContainText("0/60s");
  await page.reload();
  await waitForBattlefieldReady(page);
  await page.getByRole("button", { name: "Expand mission directive" }).click();
  await expect(page.getByRole("region", { name: "Optional objectives" })).toContainText(challenge.label);
});
