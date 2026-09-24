import type { BriefingLine, MissionProfile, ReadonlyMissionDef } from "../../types";
import type { FactionArchetype } from "../names";

export type BriefingContext = {
  seed: number;
  mission: Pick<ReadonlyMissionDef, "win" | "index">;
  profile: MissionProfile;
  place: string;
  usArchetype: FactionArchetype;
  themArchetype: FactionArchetype;
  usName: string;
  themName: string;
};

export type OptionalBriefingBeat = BriefingLine & { order: number };
