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
    "Put scouts ahead of the work crews and keep the response force within one move of the supply line.",
    "We will expand in measured steps, with a reserve ready before the front stretches thin.",
  ],
  forceQuota: [
    "Keep production protected and send each new squad to a position where it can reinforce the next contact.",
    "A larger force only helps if it arrives together; stage units before moving the front.",
  ],
  structureQuota: [
    "Place coverage before convenience, and leave room for the mobile force to pass behind the line.",
    "Build in layers so one raid cannot leave the whole position exposed.",
  ],
  destroyMarked: [
    "Use a screened advance and leave a route home before the counterattack finds us.",
    "Probe the perimeter first; commit the main force only after we know where their guns are set.",
  ],
  razeAll: [
    "Take the base apart one section at a time; do not spend the whole force on the first wall.",
    "Secure each approach before committing the next group, and keep damaged units out of the breach.",
  ],
  decapitate: [
    "Force their defense to turn with a probe, then send the main group through the opening.",
    "Do not chase every patrol; keep the strike group focused and the reserve close.",
  ],
  annihilate: [
    "Keep pressure on their survivors, but preserve enough strength to answer the last counterattack.",
    "Watch the flanks as their line breaks; a retreat can still become a counterattack.",
  ],
  holdTheLine: [
    "Rotate damaged units before they break, and keep a fallback inside the Command HQ’s defensive ring.",
    "The position lasts only while it stays supplied, repaired, and ready to move back one step.",
  ],
  escort: [
    "Keep the screen beside the slowest vehicle and let the convoy set the pace.",
    "Do not outrun the cargo; clear each lane long enough for the last truck to cross.",
  ],
  sabotage: [
    "Use the outer approach and keep a withdrawal route open before the alarm spreads.",
    "A quiet approach buys time, but the exit must be planned before contact.",
  ],
  rescue: [
    "Keep an escort on the return route before the survivors begin moving for home.",
    "Bring strength in reserve; the dangerous part begins after first contact.",
  ],
  extraction: [
    "Turn the nearest route into a corridor the enemy cannot close behind us.",
    "Cargo slows a withdrawal, so keep the force between the corridor and the last vehicle out.",
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
  if (speaker === "advisor") {
    switch (context.usArchetype) {
      case "directorate":
        return "Compliance telemetry flags a gap in their outer sensor net.";
      case "concord":
        return "Coalition scouts confirm two approaches are still open.";
      case "syndicate":
        return "Contract intelligence places their reserve near the western road.";
      case "legion":
        return "Frontline observers report a gap between their patrols.";
      default:
        return "Recon has marked a lull between the outer patrols.";
    }
  }
  if (speaker === "commander") {
    switch (context.usArchetype) {
      case "directorate":
        return "I will keep the reserve mobile until their opening is clear.";
      case "concord":
        return "I will keep the coalition force together through first contact.";
      case "syndicate":
        return "I will spend our strength where the return is greatest.";
      case "legion":
        return "I will hold the line until the advance has room to move.";
      default:
        return "I will keep a reserve ready for the first change in the front.";
    }
  }
  switch (context.themArchetype) {
    case "directorate":
      return "My sensors have already plotted your approach.";
    case "concord":
      return "My patrols will close ranks before you reach the center.";
    case "syndicate":
      return "Your losses are already priced into the contract.";
    case "legion":
      return "You will break against the vanguard before the reserve moves.";
    default:
      return "You still think the front will open for you.";
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

export function generateStory() {
  return { generateBriefing, objectivePhrase, missionObjectives };
}
