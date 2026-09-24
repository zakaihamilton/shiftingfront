import type { BriefingLine, MissionKind, MissionProfile } from "../../types";
import type { FactionArchetype } from "../names";
import { profileContractFor } from "../profile";
import type { BriefingContext } from "./types";

export function themelessPlace(place: string): string {
  return place || "this ground";
}

export function profileHook(profile: MissionProfile, place: string, biome: string): string {
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

export function profileOrder(profile: MissionProfile): string {
  const contract = profileContractFor(profile);
  return `${contract.openingOrder} Fallback plan: ${contract.fallback}`;
}

export function profileTaunt(profile: MissionProfile): string {
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

export const ADVISOR_FOLLOWUPS: Record<MissionProfile["variant"], readonly string[]> = {
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

export const COMMANDER_FOLLOWUPS: Record<MissionKind, readonly string[]> = {
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

export const ENEMY_FOLLOWUPS: Record<MissionProfile["variant"], readonly string[]> = {
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

export function optionalMissionSignal(context: BriefingContext, speaker: BriefingLine["speaker"]): string {
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

export const ADVISOR_LEADS: Record<FactionArchetype, readonly string[]> = {
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

export const COMMANDER_ACKS: Record<FactionArchetype, readonly ((analyst: string) => string)[]> = {
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
