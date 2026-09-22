import { labelFor } from "../catalog";
import type { BriefingLine, BuildingKind, Campaign, MissionKind, MissionProfile, ReadonlyMissionDef, ReadonlyWinCategory, UnitKind } from "../types";
import { biomeLabel, characterLabel, factionArchetype, type FactionArchetype } from "./names";
import { missionTimeLimitLabel } from "./objectives";
import { formatMissionMinutesFromTicks } from "./pacing";
import { profileContractFor, resolveMissionProfile } from "./profile";

function countedLabel(kind: UnitKind | BuildingKind, count: number): string {
  const label = labelFor(kind).toLowerCase();
  if (count === 1) return label;
  if (kind === "barracks") return "barracks";
  if (kind === "infantry") return "infantry";
  if (kind === "antiArmor") return "anti-armor units";
  return `${label}s`;
}

function holdDurationLabel(ticks: number): string {
  return formatMissionMinutesFromTicks(ticks);
}

function scenarioTimeLimitLabel(win: ReadonlyWinCategory): string {
  return missionTimeLimitLabel({ kind: win.kind, ticks: win.ticks ?? 3600 })!;
}

function profileHook(profile: MissionProfile, place: string, biome: string): string {
  const contract = profileContractFor(profile);
  switch (profile.variant) {
    case "resourceRace":
      return `${contract.emphasis} The richest ore seam lies exposed beyond ${place}, so the first fight will be over the harvest lanes`;
    case "forwardIndustry":
      return `${contract.emphasis} Forward industry will decide ${place}: secure the power grid and make every refinery count`;
    case "surgicalStrike":
      return `${contract.emphasis} Intelligence found a narrow breach through the ${biome}; precision matters more than a broad advance`;
    case "siege":
      return `${contract.emphasis} The ${biome} favors a slow siege, with layered defenses turning every approach into a cost`;
    case "concentratedWaves":
      return `${contract.emphasis} Enemy forces are concentrating on one line into ${place}, giving us one position to make unbreakable`;
    case "crossfire":
      return `${contract.emphasis} The ${biome} opens two approach lanes into ${place}, and the enemy intends to make us split our guard`;
    case "directRoute":
      return `${contract.emphasis} The shortest route through ${place} is open for now, but it will close once the first alarm sounds`;
    case "contestedRoute":
      return `${contract.emphasis} The route through the ${biome} is exposed on both flanks, so movement and cover must be planned together`;
    default:
      return `${contract.emphasis} The ${themelessPlace(place)} will punish a commander who ignores the ground`;
  }
}

function profileOrder(profile: MissionProfile): string {
  const contract = profileContractFor(profile);
  return `${contract.openingOrder} Fallback plan: ${contract.fallback}`;
}

function profileTaunt(profile: MissionProfile): string {
  const contract = profileContractFor(profile);
  const taunts: Record<MissionProfile["variant"], string> = {
    resourceRace: "Your harvesters will be the first things I count.",
    forwardIndustry: "Build your little machine; I know exactly where to break it.",
    surgicalStrike: "A narrow breach is still a trap if you enter it in formation.",
    siege: "Bring your army. The walls are ready for it.",
    concentratedWaves: "One road, one line, one graveyard.",
    crossfire: "Choose a flank, and I will take the other.",
    directRoute: "The easy road is the one I have watched longest.",
    contestedRoute: "Every shortcut across this ground belongs to my patrols.",
  };
  return `${contract.routeHint} ${taunts[profile.variant]}`;
}

function themelessPlace(place: string): string {
  return place || "this ground";
}

type BriefingContext = {
  seed: number;
  mission: Pick<ReadonlyMissionDef, "win" | "index">;
  profile: MissionProfile;
  place: string;
  usArchetype: FactionArchetype;
  themArchetype: FactionArchetype;
  usName: string;
  themName: string;
};

type OptionalBriefingBeat = BriefingLine & { order: number };

const ADVISOR_FOLLOWUPS: Record<MissionProfile["variant"], readonly string[]> = {
  resourceRace: [
    "The forward seam is exposed, but the nearer field will not win the race by itself.",
    "Mark the richest ore lane first; every safe credit after that depends on keeping it screened.",
  ],
  forwardIndustry: [
    "Power is the first constraint: one stalled grid leaves every production queue behind.",
    "The industrial spine must move forward in steps, or the enemy will make each new structure a liability.",
  ],
  surgicalStrike: [
    "Keep the strike group together until the breach is confirmed; a separated screen feeds the defense one target at a time.",
    "The opening is narrow, so preserve the force that reaches it instead of trading units for ground too early.",
  ],
  siege: [
    "Bring counters and a repair plan; the first defensive ring is designed to exhaust the force that reaches it.",
    "The long approach is deliberate cover, not wasted distance—use it to rotate damaged units before the breach.",
  ],
  concentratedWaves: [
    "Reserve one group for the weaker lane; a line that cannot rotate is only a delay.",
    "The main push will look obvious, but the real test is whether the fallback position remains usable.",
  ],
  crossfire: [
    "Watch both lanes, but do not split the force evenly; the enemy wants two small victories.",
    "Coverage matters more than speed here—leave one route open for a controlled withdrawal.",
  ],
  directRoute: [
    "The direct lane is a timing advantage, not a promise; shift to the fallback route when contact closes it.",
    "Move before the alarm changes the ground, then keep enough force back to exploit the second lane.",
  ],
  contestedRoute: [
    "Screen the exposed ground with your cheapest eyes first; keep the main force out of the first ambush.",
    "Both lanes are usable, but neither is free—cross the open ground with support already in position.",
  ],
};

const COMMANDER_FOLLOWUPS: Record<MissionKind, readonly string[]> = {
  harvestQuota: [
    "No heroics until the economy is online; every combat order must buy the harvesters another trip.",
    "Build the income before the army, then spend the advantage where the field is hardest to hold.",
  ],
  forceQuota: [
    "Keep the first production line moving, but do not turn the Command HQ into an undefended factory yard.",
    "Numbers win this operation only if they arrive in time to reinforce the next contact.",
  ],
  structureQuota: [
    "Site the first foundations for coverage, not convenience; unfinished structures are still part of the risk.",
    "Build the grid in layers so one raid cannot erase the work that wins the operation.",
  ],
  destroyMarked: [
    "Strike the marked targets in sequence and leave a route home before the counterattack finds us.",
    "The targets matter more than the perimeter—break the defense only as far as the objective requires.",
  ],
  razeAll: [
    "We can take the base apart one section at a time; do not spend the whole force on the first wall.",
    "Demolition is the finish, not the opening—secure the approach before committing to the final structures.",
  ],
  decapitate: [
    "Their Command HQ is the center of gravity; force the defense to turn, then finish the head.",
    "Do not chase every unit away from the objective—their base is the operation, not the retreat.",
  ],
  annihilate: [
    "Keep pressure on the survivors, but preserve enough strength to answer the last counterattack.",
    "Nothing is complete while their production or escape route remains intact.",
  ],
  holdTheLine: [
    "Rotate damaged units before they break, and keep the fallback position inside the HQ’s defensive ring.",
    "The clock is an ally only while the line remains supplied, repaired, and ready to move back one step.",
  ],
  escort: [
    "The convoy is the formation—screen its slowest vehicle and let the route determine the pace.",
    "Do not outrun the cargo; every cleared lane must be safe long enough for the last truck to cross.",
  ],
  sabotage: [
    "Take the outer systems first and keep a withdrawal route open before the alarm reaches the whole network.",
    "A quiet approach buys us time, but the exit must already be planned when the first system goes dark.",
  ],
  rescue: [
    "Contact is not enough; bring an escort to the return route before the survivors move for home.",
    "Reach the stranded units with strength in reserve—the dangerous half of the mission begins after contact.",
  ],
  extraction: [
    "Load the nearest asset first, then turn the route into a corridor the enemy cannot close behind us.",
    "Cargo slows the withdrawal, so keep the force between the extraction point and the last vehicle out.",
  ],
};

const ENEMY_FOLLOWUPS: Record<MissionProfile["variant"], readonly string[]> = {
  resourceRace: [
    "I will not chase your army while your harvesters keep you alive; expect my patrols where the ore is richest.",
    "Your economy is a map I can read—every full load tells me where the next fight begins.",
  ],
  forwardIndustry: [
    "Every new relay tells me where to aim; build forward and I will turn the grid against you.",
    "Your factories need power, and power needs ground—take one away and the whole machine stalls.",
  ],
  surgicalStrike: [
    "Bring your narrow force through the breach; I only need one stalled unit to close it behind you.",
    "Precision is another word for having nowhere to hide when the first shot misses.",
  ],
  siege: [
    "You may reach the outer wall, but every repair you spend there makes the inner ring stronger.",
    "Count the distance to my base in damaged units; the walls are only doing their work.",
  ],
  concentratedWaves: [
    "Hold one road if you like—I will make the other road expensive enough to split you.",
    "A single strong line still has a flank, and I have time to find it.",
  ],
  crossfire: [
    "Guard both approaches and you guard neither; choose a lane, and I will choose the other.",
    "Your map shows two roads. My army only needs one opening.",
  ],
  directRoute: [
    "The shortest road is mine to close; arrive late and you will find the detour waiting under fire.",
    "Run for the direct lane while it is open—my first alarm is already written.",
  ],
  contestedRoute: [
    "Every shortcut across this ground belongs to my patrols; your screen will find us by losing pieces of itself.",
    "There is a safer lane, but safe is not the same as fast—and time is on my side.",
  ],
};

function lineCountFor(context: BriefingContext): 3 | 4 | 5 {
  const roll = variantIndex(
    `${context.seed}:${context.mission.index}:${context.mission.win.kind}:${context.place}:${context.profile.variant}:line-count`,
    10,
  );
  if (roll < 6) return 3;
  if (roll < 9) return 4;
  return 5;
}

function pickBriefingVariant(context: BriefingContext, label: string, size: number): number {
  return variantIndex(
    `${context.seed}:${context.mission.index}:${context.mission.win.kind}:${context.place}:${context.profile.variant}:${label}`,
    size,
  );
}

function optionalMissionSignal(context: BriefingContext, speaker: BriefingLine["speaker"]): string {
  const objective = objectivePhrase(context.mission.win);
  if (speaker === "advisor") {
    switch (context.usArchetype) {
      case "directorate":
        return `Compliance protocol demands our primary focus: ${objective}.`;
      case "concord":
        return `The coalition assembly charges us with one duty: ${objective}.`;
      case "syndicate":
        return `The high-yield contract clause specifies: ${objective}.`;
      case "legion":
        return `Our frontline order is unambiguous: ${objective}.`;
      default:
        return `That leaves one priority: ${objective}.`;
    }
  }
  if (speaker === "commander") {
    switch (context.usArchetype) {
      case "directorate":
        return `Standard directive is clear: we will ${objective}.`;
      case "concord":
        return `Our mutual pact holds: we must ${objective}.`;
      case "syndicate":
        return `The operational ledger is set: we ${objective}.`;
      case "legion":
        return `Sound the advance: we ${objective}.`;
      default:
        return `The current order remains to ${objective}.`;
    }
  }
  switch (context.themArchetype) {
    case "directorate":
      return `Your unauthorized attempt to ${objective} is marked for termination.`;
    case "concord":
      return `Our collective front will never permit you to ${objective}.`;
    case "syndicate":
      return `Your projected failure to ${objective} is already priced in.`;
    case "legion":
      return `You will break against our vanguard before you ever ${objective}.`;
    default:
      return `You still intend to ${objective}, of course.`;
  }
}

function optionalBriefingBeats(context: BriefingContext): OptionalBriefingBeat[] {
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

function addOptionalBriefingBeats(
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

function objectivePhrase(win: ReadonlyWinCategory): string {
  switch (win.kind) {
    case "harvestQuota":
      return `extract ${win.target} credits from the field`;
    case "forceQuota":
      return win.role
        ? `train ${win.target} ${countedLabel(win.role, win.target ?? 0)}`
        : `train ${win.target} combat units`;
    case "structureQuota":
      return win.building
        ? `build ${win.target} ${countedLabel(win.building, win.target ?? 0)}`
        : `raise ${win.target} structures`;
    case "destroyMarked":
      return `destroy the ${win.targetCount ?? 1} marked enemy structures`;
    case "razeAll":
      return "level every enemy building";
    case "decapitate":
      return `destroy the enemy ${labelFor("constructionYard")}`;
    case "annihilate":
      return "wipe out every enemy unit and building";
    case "holdTheLine":
      return `hold this ground for ${holdDurationLabel(win.ticks ?? 0)}`;
    case "escort":
      return `escort ${win.targetCount ?? 1} convoy units to extraction within ${scenarioTimeLimitLabel(win)}`;
    case "sabotage":
      return `sabotage ${win.targetCount ?? 1} enemy systems within ${scenarioTimeLimitLabel(win)}`;
    case "rescue":
      return `rescue ${win.targetCount ?? 1} stranded units within ${scenarioTimeLimitLabel(win)}`;
    case "extraction":
      return `extract ${win.targetCount ?? 1} assets within ${scenarioTimeLimitLabel(win)}`;
    default:
      return "complete the assigned objective";
  }
}

export function objectiveHeadline(win: ReadonlyWinCategory): string {
  const phrase = objectivePhrase(win);
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export type MissionObjective = {
  id: string;
  text: string;
};

export function missionObjectives(
  mission: Pick<ReadonlyMissionDef, "win" | "index">,
  campaign: Pick<Campaign, "world" | "factions">,
): MissionObjective[] {
  const win = mission.win;
  const [us, them] = campaign.factions;
  const place = campaign.world.name;
  const winText = (() => {
    switch (win.kind) {
      case "harvestQuota":
        return `Extract ${win.target} credits from ${place}`;
      case "forceQuota":
        return win.role
          ? `Train ${win.target} ${countedLabel(win.role, win.target ?? 0)} for the ${us.name}`
          : `Train ${win.target} combat units for the ${us.name}`;
      case "structureQuota":
        return win.building
          ? `Build ${win.target} ${countedLabel(win.building, win.target ?? 0)}`
          : `Raise ${win.target} structures on ${place}`;
      case "destroyMarked":
        return `Destroy the ${win.targetCount ?? 1} marked enemy structures`;
      case "razeAll":
        return `Level every ${them.name} building`;
      case "decapitate":
        return `Destroy the ${them.name} ${labelFor("constructionYard")}`;
      case "annihilate":
        return `Wipe out all ${them.name} forces`;
      case "holdTheLine":
        return `Hold ${place} for ${holdDurationLabel(win.ticks ?? 0)}`;
      case "escort":
        return `Escort the convoy through ${place} within ${scenarioTimeLimitLabel(win)}`;
      case "sabotage":
        return `Sabotage ${win.targetCount ?? 1} enemy systems within ${scenarioTimeLimitLabel(win)}`;
      case "rescue":
        return `Contact and return ${win.targetCount ?? 1} stranded units within ${scenarioTimeLimitLabel(win)}`;
      case "extraction":
        return `Extract ${win.targetCount ?? 1} assets from ${place} within ${scenarioTimeLimitLabel(win)}`;
      default:
        return "Complete the assigned objective";
    }
  })();
  return [
    { id: "win", text: winText },
    { id: "yard", text: `Protect our ${labelFor("constructionYard")}` },
    {
      id: "campaign",
      text: `Hold ${place} against the ${them.name}`,
    },
  ];
}

/**
 * FNV-1a over a short key: picks deterministic dialogue variants so two
 * missions of one campaign rarely open identically without needing an RNG
 * threaded through campaign generation.
 */
function variantIndex(key: string, mod: number): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % mod;
}

const ADVISOR_LEADS: Record<FactionArchetype, readonly string[]> = {
  directorate: [
    "Bureau telemetry and orbital recon are logged.",
    "Direct transmission from Directorate Intelligence.",
    "Signal intercepts verified under protocol alpha.",
    "Tactical audit cleared an hour ago.",
    "Central monitoring confirms enemy movements.",
    "Recon logs are processed and verified.",
  ],
  concord: [
    "Allied scout detachments just returned.",
    "Border watch reports are confirmed.",
    "Coalition liaison verified the telemetry.",
    "Signals from the forward sentries cleared.",
    "The mutual defense network flagged this sector.",
    "Forward observers checked in early.",
  ],
  syndicate: [
    "Contract surveyors logged the terrain metrics.",
    "Asset surveillance just filed its return.",
    "Market monitors and recon probes confirm it.",
    "Risk assessment models are finalized.",
    "Recon telemetry cleared on private frequencies.",
    "Long-range scans cleared an hour ago.",
  ],
  legion: [
    "Forward vanguard clocked the perimeter.",
    "Frontline scouts made first visual.",
    "Outriders just rode back from the wire.",
    "Combat telemetry is locked in.",
    "Signal intercepts just confirmed it.",
    "Recon is in from the forward screen.",
  ],
};

const COMMANDER_ACKS: Record<FactionArchetype, readonly ((analyst: string) => string)[]> = {
  directorate: [
    (analyst: string) => `Directives acknowledged from ${analyst}. Protocol confirmed.`,
    (analyst: string) => `${analyst}'s intelligence matches Directorate priority metrics.`,
    (analyst: string) => `Command acknowledges ${analyst}'s telemetry.`,
    (analyst: string) => `Confirmed — ${analyst} has the operational measure of it.`,
    (analyst: string) => `Protocol approved: ${analyst} is right on every count.`,
    (analyst: string) => `That matches ${analyst}'s tactical audit.`,
  ],
  concord: [
    (analyst: string) => `The coalition concurs with ${analyst}'s assessment.`,
    (analyst: string) => `Our allies stand behind ${analyst}'s tactical read.`,
    (analyst: string) => `${analyst} speaks for the council's resolve.`,
    (analyst: string) => `Confirmed — ${analyst} sees the defensive reality clearly.`,
    (analyst: string) => `The alliance endorses ${analyst}'s counsel without hesitation.`,
    (analyst: string) => `That matches ${analyst}'s strategic assessment.`,
  ],
  syndicate: [
    (analyst: string) => `${analyst}'s audit accounts for all operational liabilities.`,
    (analyst: string) => `The risk-adjusted assessment from ${analyst} is approved.`,
    (analyst: string) => `Contract parameters verified by ${analyst}.`,
    (analyst: string) => `Confirmed — ${analyst} evaluates the assets accurately.`,
    (analyst: string) => `${analyst} prices the tactical risks precisely.`,
    (analyst: string) => `That matches ${analyst}'s balance sheet.`,
  ],
  legion: [
    (analyst: string) => `${analyst} calls the front plain and true.`,
    (analyst: string) => `Iron and blood: ${analyst} marks where we strike.`,
    (analyst: string) => `No wasted words from ${analyst}. We push.`,
    (analyst: string) => `Confirmed — ${analyst} knows where the fighting will be thickest.`,
    (analyst: string) => `${analyst} is right on every count.`,
    (analyst: string) => `That matches ${analyst}'s frontline report.`,
  ],
};

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
        return `Our geologists count ${win.target} credits still in the ground under ${place}. ${foe} has scouts working the ${biome}, and the ${them.name} intends to starve this field before we load a single harvester.`;
      case "forceQuota":
        return `Headcounts put us light against the ${them.name} buildup in the ${biome}. We need ${win.target} ${win.role ? countedLabel(win.role, win.target ?? 0) : "combat units"} in the field soon — ${foe} recruits faster than we do.`;
      case "structureQuota":
        return `${place} is open ground right now, but not for long. Survey calls for ${win.target} ${win.building ? countedLabel(win.building, win.target ?? 0) : "structures"}, sited before the ${them.name} arrives in strength through the ${biome}. Every foundation gets more expensive once ${foe} commits.`;
      case "destroyMarked":
        return `We painted ${win.targetCount ?? 1} high-value structures inside the enemy perimeter at ${place}. Kill them and the ${them.name} line folds. ${foe} knows we know — expect layered defenses.`;
      case "razeAll":
        return `No occupation this time. The ${them.name} built hard across ${place}; command wants every structure gone. Leave ${foe} nothing worth garrisoning in the ${biome}.`;
      case "decapitate":
        return `Every ${them.name} operation routes through a single ${labelFor("constructionYard")} under ${foe}'s banner in the ${biome}. Find it and cut it out of ${place} — without it they cannot rebuild.`;
      case "annihilate":
        return `This ends at ${place}. Every ${them.name} unit, every structure — gone from the ${biome}. ${foe} does not get a second base or a third chance.`;
      case "holdTheLine":
        return `${foe} is massing for a full push on ${place}. If we stand for ${holdDurationLabel(win.ticks ?? 0)}, their advance dies in the ${biome}. Expect everything they have left.`;
      case "escort":
        return `A supply convoy crosses ${place} — ${win.targetCount ?? 1} slow movers through ambush country. ${foe} hunts soft targets first, and the ${biome} offers endless killing lanes; reach extraction within ${scenarioTimeLimitLabel(win)}.`;
      case "sabotage":
        return `${foe} runs ${win.targetCount ?? 1} hardened systems beneath ${place}: comms, power, munitions. Drop all of them within ${scenarioTimeLimitLabel(win)} and the ${them.name} goes blind in the ${biome}.`;
      case "rescue":
        return `Survivors are broadcasting from the ${biome} — ${win.targetCount ?? 1} of ours at ${place}, scattered but alive. ${foe}'s sweeps close by the hour; bring them home within ${scenarioTimeLimitLabel(win)}.`;
      case "extraction":
        return `Our assets at ${place} are packed and ready — ${win.targetCount ?? 1} crates that cannot reach ${them.name} hands. Pull them out within ${scenarioTimeLimitLabel(win)}, before ${foe} seals the corridor.`;
      default:
        return `The ${them.name} holds the ${biome}, and ${foe} means to keep it. ${us.name} command requires that we ${objectivePhrase(win)} before they finish digging in.`;
    }
  })();

  const orders = (() => {
    switch (win.kind) {
      case "harvestQuota":
        return `Then the ore comes out first. Get your harvesters rolling, screen the refineries, and keep the ${labelFor("constructionYard")} protected — no ore, no war.`;
      case "forceQuota":
        return `Then we out-produce them. Train those units fast, cover the ${labelFor("constructionYard")} while they come online, and make ${foe} pay for every probe against your lines.`;
      case "structureQuota":
        return `Break ground now. I want those structures up before the ${them.name} crests the ridge, turrets covering the approaches, and the ${labelFor("constructionYard")} defended around the clock.`;
      case "destroyMarked":
        return `Strike the marked targets hard and fast — in, out, done. Keep the ${labelFor("constructionYard")} standing while you do it. Losing it loses ${place}.`;
      case "razeAll":
        return `Total demolition, then. Nothing of theirs stays upright across ${place}. Ours stays up — starting with the ${labelFor("constructionYard")}.`;
      case "decapitate":
        return `One target matters. Their ${labelFor("constructionYard")} falls today — cut the head off and the rest is cleanup at ${place}. Guard ours until then.`;
      case "annihilate":
        return `Understood. Nothing walks away and nothing stands. Shield the ${labelFor("constructionYard")} while you finish the ${them.name} off.`;
      case "holdTheLine":
        return `Then we plant our boots. The line holds for ${holdDurationLabel(win.ticks ?? 0)} — not a second less — and the ${labelFor("constructionYard")} holds with it.`;
      case "escort":
        return `The convoy reaches extraction. Screen the route, keep escorts tight, and cover the ${labelFor("constructionYard")} until the last wheel clears ${place}.`;
      case "sabotage":
        return `Quiet work, loud exit. All of those systems go dark before the deadline — and if the ${labelFor("constructionYard")} is threatened, the HQ wins.`;
      case "rescue":
        return `We bring our people home. Fast in, faster out — and the ${labelFor("constructionYard")} stays untouchable until they are aboard.`;
      case "extraction":
        return `Load everything. Nothing of ours stays on ${place} for ${foe} to catalogue. The ${labelFor("constructionYard")} stands until the last lift clears.`;
      default:
        return `Proceed as briefed. Protect the ${labelFor("constructionYard")}, complete the objective, and give ${foe} no openings. Good hunting.`;
    }
  })();

  const taunt = (() => {
    switch (win.kind) {
      case "harvestQuota":
        return `Ore flows to the strong, ${you}. The ${them.name} claims this field — roll your harvesters out and watch them burn.`;
      case "forceQuota":
        return `Count your new recruits twice, ${you}. The ${biome} has swallowed better armies than the one you are assembling.`;
      case "structureQuota":
        return `Raise your little fortress, ${you}. Fixed defenses only give ${foe} something to aim at.`;
      case "destroyMarked":
        return `Come for the painted structures by all means, ${you}. The ${biome} is generous with graves.`;
      case "razeAll":
        return `Burn whatever you can reach, ${you}. The ${them.name} buries arsonists where they stand.`;
      case "decapitate":
        return `Our ${labelFor("constructionYard")} sits behind three lines of steel, ${you}. Bring a map. You will want it for the retreat.`;
      case "annihilate":
        return `You want everything dead, ${you}? Bold words from someone so exposed. The ${them.name} digs graves in pairs.`;
      case "holdTheLine":
        return `Dig in all you like, ${you}. Time fights for the ${them.name}. When the clock runs down, the ${biome} belongs to ${foe}.`;
      case "escort":
        return `Your convoy rolls into a shooting gallery, ${you}. ${foe} collects its tolls in wrecks.`;
      case "sabotage":
        return `Sneak, crawl, cut wires — it changes nothing, ${you}. ${foe}'s systems bite back, and my crews are waiting.`;
      case "rescue":
        return `Faint signals in the dark, ${you}. Your people stopped answering hours ago, and ${foe} sweeps closer every hour you delay.`;
      case "extraction":
        return `Run with your cargo, ${you}. The corridor out of ${place} closes soon — and it closes on whatever is still inside.`;
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

export function generateStory() {
  return { generateBriefing, objectivePhrase, missionObjectives };
}
