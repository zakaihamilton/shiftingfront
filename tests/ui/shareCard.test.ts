// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCampaign } from "../../lib/gen/campaign";
import { freshCampaignProgress } from "../../lib/persist/campaign";
import { formatCampaignShareCard } from "../../lib/ui/shareCard";

afterEach(() => vi.unstubAllGlobals());

describe("share cards", () => {
  it("uses the current browser origin for campaign links", () => {
    const card = formatCampaignShareCard(createCampaign(421), freshCampaignProgress(421));

    expect(card).toContain("SHIFTING FRONT // Campaign Dossier");
    expect(card).toContain("http://localhost:3000/?seed=0421");
  });

  it("uses a relative link when formatted without a browser window", () => {
    vi.stubGlobal("window", undefined);

    const card = formatCampaignShareCard(createCampaign(421), freshCampaignProgress(421));

    expect(card).toContain("SHIFTING FRONT // Campaign Dossier");
    expect(card).toContain("/?seed=0421");
    expect(card).not.toContain("vercel.app");
  });
});
