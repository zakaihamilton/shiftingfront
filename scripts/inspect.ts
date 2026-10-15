import { createCampaign } from "../lib/gen/campaign";
import { describeMap, generateMap } from "../lib/gen/map";
import { parseSeed } from "../lib/seed/rng";
import { createMission, inspect } from "../lib/sim/api";

const raw = process.argv[2] ?? "0000";
const seed = parseSeed(raw);
if (seed === null) {
  console.error("Usage: pnpm inspect 0421");
  process.exit(1);
}

const campaign = createCampaign(seed);
const missions = campaign.missions.map((m) => {
  const state = createMission({ seed, missionIndex: m.index });
  const map = generateMap(seed, m);
  return {
    index: m.index,
    name: m.name,
    biome: m.biome,
    win: m.win,
    briefing: m.briefing,
    map: describeMap(map),
    inspect: inspect(state),
  };
});

console.log(
  JSON.stringify(
    {
      seed: campaign.seed,
      world: campaign.world,
      factions: campaign.factions.map((f) => ({ name: f.name, palette: f.palette })),
      characters: {
        commander: campaign.characters.commander.name,
        advisor: campaign.characters.advisor.name,
        enemyLeader: campaign.characters.enemyLeader.name,
      },
      missions,
    },
    null,
    2,
  ),
);
