import { describe, expect, it } from "vitest";
import { createCampaign } from "../../lib/gen/campaign";
import { generateCharacters } from "../../lib/gen/characters";
import { generateFactions } from "../../lib/gen/factions";
import { generateWorld } from "../../lib/gen/world";
import {
  NEUTRAL_PLACE_ADJ,
  BIOME_PLACE_ADJ,
  NEUTRAL_FACTION_ADJ,
  BIOME_FACTION_ADJ,
} from "../../lib/gen/names";

const ENGLISH_NAME = /^[A-Z][a-z]+ [A-Z][a-z]+$/;

describe("generated names", () => {
  it("uses readable English names for people, factions, and places", () => {
    for (const seed of [0, 42, 421, 2346, 9999]) {
      const world = generateWorld(seed);
      const factions = generateFactions(seed);
      const characters = generateCharacters(seed);
      expect(world.name).toMatch(ENGLISH_NAME);
      expect(factions[0].name).toMatch(ENGLISH_NAME);
      expect(factions[1].name).toMatch(ENGLISH_NAME);
      expect(factions[0].name).not.toBe(factions[1].name);
      expect(characters.commander.name).toMatch(ENGLISH_NAME);
      expect(characters.advisor.name).toMatch(ENGLISH_NAME);
      expect(characters.enemyLeader.name).toMatch(ENGLISH_NAME);
    }
  });

  it("gives missions English titles instead of invented codewords", () => {
    const campaign = createCampaign(2346);
    for (const mission of campaign.missions) {
      expect(mission.name).toMatch(/^[A-Za-z][A-Za-z ]+$/);
      expect(mission.name).not.toMatch(/Directive|Zha|Keth|Dax/i);
      expect(mission.briefing[0]!.text).not.toContain(mission.name);
      expect(mission.briefing.map((line) => line.text).join(" ")).not.toMatch(/under strength|levy|form up|right of it/i);
    }
  });

  it("uses the same character labels in orders as on the portraits", () => {
    const campaign = createCampaign(2346);
    const { advisor, commander, enemyLeader } = campaign.characters;
    const labels = [
      `${advisor.title} ${advisor.name}`,
      `${commander.title} ${commander.name}`,
      `${enemyLeader.title} ${enemyLeader.name}`,
    ];
    for (const mission of campaign.missions) {
      const joined = mission.briefing.map((line) => line.text).join(" ");
      for (const label of labels) {
        expect(joined).toContain(label);
      }
    }
  });

  it("aligns place names and faction names to their respective biomes", () => {
    for (let seed = 0; seed < 50; seed++) {
      const campaign = createCampaign(seed);
      const biome = campaign.world.biome;
      const placeAdj = campaign.world.name.split(" ")[0]!;
      const allowedPlaceAdjs = [...NEUTRAL_PLACE_ADJ, ...BIOME_PLACE_ADJ[biome]];
      expect(allowedPlaceAdjs).toContain(placeAdj);

      for (const faction of campaign.factions) {
        const factionAdj = faction.name.split(" ")[0]!;
        const allowedFactionAdjs = [...NEUTRAL_FACTION_ADJ, ...(BIOME_FACTION_ADJ[biome] ?? [])];
        expect(allowedFactionAdjs).toContain(factionAdj);
      }
    }
  });
});
