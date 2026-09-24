import type { BriefingLine, Campaign, ReadonlyMissionDef } from "../../types";
import { biomeLabel, characterLabel, factionArchetype } from "../names";
import { resolveMissionProfile } from "../profile";
import { objectivePhrase } from "./objectivesText";
import {
  ADVISOR_FOLLOWUPS,
  ADVISOR_LEADS,
  COMMANDER_ACKS,
  COMMANDER_FOLLOWUPS,
  ENEMY_FOLLOWUPS,
  optionalMissionSignal,
  profileHook,
  profileOrder,
  profileTaunt,
} from "./dialogueTemplates";
import type { BriefingContext, OptionalBriefingBeat } from "./types";

/**
 * FNV-1a over a short key: picks deterministic dialogue variants so two
 * missions of one campaign rarely open identically without needing an RNG
 * threaded through campaign generation.
 */
export function variantIndex(key: string, mod: number): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % mod;
}

export function pickBriefingVariant(context: BriefingContext, label: string, size: number): number {
  return variantIndex(
    `${context.seed}:${context.mission.index}:${context.mission.win.kind}:${context.place}:${context.profile.variant}:${label}`,
    size,
  );
}

export function lineCountFor(context: BriefingContext): 3 | 4 | 5 {
  const roll = variantIndex(
    `${context.seed}:${context.mission.index}:${context.mission.win.kind}:${context.place}:${context.profile.variant}:line-count`,
    10,
  );
  if (roll < 6) return 3;
  if (roll < 9) return 4;
  return 5;
}

export function optionalBriefingBeats(context: BriefingContext): OptionalBriefingBeat[] {
  const advisor = ADVISOR_FOLLOWUPS[context.profile.variant];
  const commander = COMMANDER_FOLLOWUPS[context.mission.win.kind];
  const enemy = ENEMY_FOLLOWUPS[context.profile.variant];
  return [
    {
      speaker: "advisor",
      text: `${advisor[pickBriefingVariant(context, "advisor-followup", advisor.length)]!} ${optionalMissionSignal(context, "advisor")}`,
      order: 0,
    },
    {
      speaker: "commander",
      text: `${commander[pickBriefingVariant(context, "commander-followup", commander.length)]!} ${optionalMissionSignal(context, "commander")}`,
      order: 1,
    },
    {
      speaker: "enemyLeader",
      text: `${enemy[pickBriefingVariant(context, "enemy-followup", enemy.length)]!} ${optionalMissionSignal(context, "enemyLeader")}`,
      order: 2,
    },
  ];
}

export function addOptionalBriefingBeats(
  context: BriefingContext,
  required: BriefingLine[],
): BriefingLine[] {
  const optionalCount = lineCountFor(context) - required.length;
  if (optionalCount <= 0) return required;

  const selected = optionalBriefingBeats(context)
    .map((beat) => ({
      beat,
      rank: pickBriefingVariant(context, `optional-order:${beat.speaker}`, 10_000),
    }))
    .sort((a, b) => a.rank - b.rank || a.beat.order - b.beat.order)
    .slice(0, optionalCount)
    .map(({ beat }) => beat);
  const bySpeaker = new Map(selected.map((beat) => [beat.speaker, beat]));

  const output: BriefingLine[] = [];
  const advisor = required.find((line) => line.speaker === "advisor");
  const commander = required.find((line) => line.speaker === "commander");
  const enemy = required.find((line) => line.speaker === "enemyLeader");
  if (!advisor || !commander || !enemy) return required;

  output.push(advisor);
  const advisorBeat = bySpeaker.get("advisor");
  if (advisorBeat) output.push(advisorBeat);
  output.push(commander);
  const commanderBeat = bySpeaker.get("commander");
  if (commanderBeat) output.push(commanderBeat);
  output.push(enemy);
  const enemyBeat = bySpeaker.get("enemyLeader");
  if (enemyBeat) output.push(enemyBeat);
  return output;
}

export function generateBriefing(
  campaign: Pick<Campaign, "world" | "factions" | "characters"> & { seedNumber?: number },
  mission: Pick<ReadonlyMissionDef, "name" | "win" | "index" | "biome" | "profile">,
): BriefingLine[] {
  const { advisor, commander, enemyLeader } = campaign.characters;
  const [us, them] = campaign.factions;
  const place = campaign.world.name;
  const biome = biomeLabel(mission.biome);
  const analyst = characterLabel(advisor);
  const you = characterLabel(commander);
  const foe = characterLabel(enemyLeader);
  const win = mission.win;
  const profile = resolveMissionProfile(campaign.seedNumber ?? 0, mission.index, win.kind, mission.profile);
  const usArchetype = factionArchetype(us.name);
  const themArchetype = factionArchetype(them.name);
  const context: BriefingContext = {
    seed: campaign.seedNumber ?? 0,
    mission,
    profile,
    place,
    usArchetype,
    themArchetype,
    usName: us.name,
    themName: them.name,
  };
  const pick = (label: string, mod: number) => pickBriefingVariant(context, label, mod);
  const leads = ADVISOR_LEADS[usArchetype];
  const acks = COMMANDER_ACKS[usArchetype];
  const lead = leads[pick("advisor-lead", leads.length)]!;
  const ack = acks[pick("commander-ack", acks.length)]!(analyst);

  const report = (() => {
    switch (win.kind) {
      case "harvestQuota":
        return `Recon sees ${them.name} patrols moving between ${place} and the outer supply lanes. ${foe} is watching the ${biome}, but our survey found a gap in their coverage.`;
      case "forceQuota":
        return `Signals place ${them.name} reinforcements near ${place}. ${foe} is building a reserve in the ${biome}, while our scouts have kept one approach unobserved.`;
      case "structureQuota":
        return `${place} is open ground for now. Our survey marks firm approaches through the ${biome}, though ${foe} has scouts moving in from the ${them.name} line.`;
      case "destroyMarked":
        return `Thermal scans at ${place} show the ${them.name} perimeter is layered, with mobile guards behind the first line. ${foe} knows our scouts have been close.`;
      case "razeAll":
        return `The ${them.name} has built a deep perimeter across ${place}. ${foe} is using the broken ground in the ${biome} to hide short-range patrols.`;
      case "decapitate":
        return `${foe} keeps the central command network behind several relays at ${place}. Our scouts found the outer screen, but not the full shape of the defense.`;
      case "annihilate":
        return `The ${them.name} has concentrated its remaining strength around ${place}. ${foe} is leaving few gaps in the ${biome}, so expect a fight at every approach.`;
      case "holdTheLine":
        return `${foe} is moving artillery toward ${place}. Fresh tracks in the ${biome} point to a coordinated push against our outer positions.`;
      case "escort":
        return `A supply column is moving through ${place}. ${foe}'s patrols favor the narrow lanes in the ${biome}, and the convoy route crosses several of them.`;
      case "sabotage":
        return `${foe} has hardened the communications network around ${place}. The ${them.name} patrols are shifting between relay stations in the ${biome}.`;
      case "rescue":
        return `Faint transmissions are coming from the ${biome} around ${place}. ${foe}'s patrol sweeps are closing in, but the signal is still moving.`;
      case "extraction":
        return `Our crews report the corridor at ${place} is still passable. ${foe} is shifting patrols into the ${biome}, and the route may not stay open.`;
      default:
        return `The ${them.name} holds the ${biome}, and ${foe} means to keep it. ${us.name} command requires that we ${objectivePhrase(win)} before they finish digging in.`;
    }
  })();

  const orders = (() => {
    switch (win.kind) {
      case "harvestQuota":
        return `Set a protected base, screen the supply lanes, and keep a mobile group close enough to answer a raid.`;
      case "forceQuota":
        return `Keep the production line protected and stage each group before it moves beyond the base defenses.`;
      case "structureQuota":
        return `Place coverage before convenience, and leave the mobile force a route behind the line.`;
      case "destroyMarked":
        return `Scout the perimeter, send a screened strike group through the opening, and keep a reserve on the return route.`;
      case "razeAll":
        return `Advance by sections. Keep the line repaired and do not spend the whole force on the first breach.`;
      case "decapitate":
        return `Draw their guards away with a probe, then move the strike group through the route our scouts identify.`;
      case "annihilate":
        return `Keep pressure on the front and watch for a retreat that turns into a counterattack.`;
      case "holdTheLine":
        return `Layer the approaches, rotate damaged teams early, and keep the fallback position within support range.`;
      case "escort":
        return `Scout choke points ahead of the convoy and keep escorts close enough to cover its slowest vehicle.`;
      case "sabotage":
        return `Use the quiet approach while it lasts, then withdraw along a route already covered by the strike group.`;
      case "rescue":
        return `Keep the approach clear and put an escort between the returning group and the nearest patrols.`;
      case "extraction":
        return `Secure the corridor before moving the cargo, and keep a mobile screen between it and the enemy.`;
      default:
        return `Proceed deliberately, protect the base, and give ${foe} no opening to split the force.`;
    }
  })();

  const taunt = (() => {
    switch (win.kind) {
      case "harvestQuota":
        return `This ground has buried stronger forces than yours, ${you}. Advance and my guns will show you where.`;
      case "forceQuota":
        return `Count your recruits twice, ${you}. The ${biome} has swallowed better armies than the one you brought.`;
      case "structureQuota":
        return `Build whatever walls steady you, ${you}. My guns already know the approaches.`;
      case "destroyMarked":
        return `Your scouts have seen only the first line, ${you}. The ${biome} is generous with graves.`;
      case "razeAll":
        return `The smoke will mark your position before anything falls, ${you}. My patrols are waiting.`;
      case "decapitate":
        return `My command network sits behind layers of steel, ${you}. Bring a map for the retreat.`;
      case "annihilate":
        return `Bold words from someone with a retreat route I can see, ${you}. We dig graves in pairs.`;
      case "holdTheLine":
        return `Dig in all you like, ${you}. Weather, supply, and artillery all work for me.`;
      case "escort":
        return `That road offers more cover for my guns than yours, ${you}.`;
      case "sabotage":
        return `Quiet approaches end when my patrols start asking questions, ${you}.`;
      case "rescue":
        return `Every signal crosses ground my patrols know, ${you}. We are closing in.`;
      case "extraction":
        return `This corridor narrows after dusk, ${you}. You will learn where it closes.`;
      default:
        return `The ${biome} already flies ${them.name} colors, ${you}. Pray your retreat outruns your advance.`;
    }
  })();

  const required: BriefingLine[] = [
    { speaker: "advisor", text: `${lead} ${profileHook(profile, place, biome)}. ${report}` },
    { speaker: "commander", text: `${ack} ${profileOrder(profile)} ${orders}` },
    { speaker: "enemyLeader", text: `${profileTaunt(profile)} ${taunt}` },
  ];
  return addOptionalBriefingBeats(context, required);
}
