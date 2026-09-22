import { describe, expect, it } from "vitest";
import { factionArchetype, FACTION_DOCTRINES } from "../../lib/gen/names";
import { createCampaign } from "../../lib/gen/campaign";

describe("faction narrative and dialect enrichment", () => {
  it("classifies faction archetypes correctly", () => {
    expect(factionArchetype("Northern Directorate")).toBe("directorate");
    expect(factionArchetype("Solar Mandate")).toBe("directorate");
    expect(factionArchetype("Iron Concord")).toBe("concord");
    expect(factionArchetype("United Coalition")).toBe("concord");
    expect(factionArchetype("Outer Syndicate")).toBe("syndicate");
    expect(factionArchetype("Amber Circle")).toBe("syndicate");
    expect(factionArchetype("Crimson Legion")).toBe("legion");
    expect(factionArchetype("Steel Front")).toBe("legion");
  });

  it("provides distinct doctrine definitions and rationales for all archetypes", () => {
    for (const archetype of ["directorate", "concord", "syndicate", "legion"] as const) {
      const entry = FACTION_DOCTRINES[archetype];
      expect(entry.doctrine).toBeTruthy();
      expect(entry.motto).toBeTruthy();
      expect(entry.dialectTerms.length).toBeGreaterThan(2);
      expect(entry.rationale("harvest operation")).toContain("harvest operation");
    }
  });

  it("generates briefings with dialect variety according to faction archetypes", () => {
    for (let seed = 0; seed < 20; seed++) {
      const campaign = createCampaign(seed);
      const [us, them] = campaign.factions;
      const usArch = factionArchetype(us.name);
      const themArch = factionArchetype(them.name);
      expect(["directorate", "concord", "syndicate", "legion"]).toContain(usArch);
      expect(["directorate", "concord", "syndicate", "legion"]).toContain(themArch);

      for (const mission of campaign.missions) {
        expect(mission.briefing.length).toBeGreaterThanOrEqual(3);
        expect(mission.briefing.length).toBeLessThanOrEqual(5);
        for (const line of mission.briefing) {
          expect(line.text).toMatch(/[.!?]$/);
        }
      }
    }
  });
});
