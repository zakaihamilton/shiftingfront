import type { Rng } from "../seed/rng";
import type { CharacterRole, FaceDna } from "../types";
import { type PortraitPickOptions, portraitCandidates } from "./portraitCatalog";

export function generateFace(
  rng: Rng,
  role?: CharacterRole,
  opts?: { feminine?: boolean } & Pick<PortraitPickOptions, "excludeIds" | "excludeSheets">,
): FaceDna {
  const feminine = opts?.feminine ?? rng.chance(0.48);
  const asset = rng.pick(
    portraitCandidates({
      role,
      feminine,
      excludeIds: opts?.excludeIds,
      excludeSheets: opts?.excludeSheets,
    }),
  );
  return {
    portraitId: asset.id,
    feminine: asset.feminine,
  };
}
