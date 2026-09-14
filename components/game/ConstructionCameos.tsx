import { BUILDING_STATS, buildingCameoStatus, buildingLimitReached, labelFor } from "@/lib/catalog";
import type { BuildingKind, FactionVisualProfile, Palette, SimState } from "@/lib/types";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import { CameoGrid } from "./CameoGrid";
import { CommandCameo } from "./CommandCameo";
import { PLACEABLE } from "./hooks/useGameActions";

export function ConstructionCameos({
  state,
  palette,
  profile,
  placeKind,
  onPlace,
  onCancelBuilding,
}: {
  state: SimState;
  palette: Palette;
  profile: FactionVisualProfile;
  placeKind: BuildingKind | null;
  onPlace: (kind: BuildingKind) => void;
  onCancelBuilding: (kind: BuildingKind) => void;
}) {
  return (
    <CameoGrid>
      {PLACEABLE.map((kind, index) => {
        const cameo = buildingCameoStatus(state.entities, 0, kind);
        const disabledReason = cameo.phase === "idle" ? constructionBlockerText(state, kind) : undefined;
        return (
          <CommandCameo
            key={kind}
            kind={kind}
            palette={palette}
            profile={profile}
            cost={BUILDING_STATS[kind].cost}
            disabled={disabledReason !== undefined}
            disabledReason={disabledReason}
            detail={BUILDING_STATS[kind].power === 0
              ? "No grid load"
              : BUILDING_STATS[kind].power > 0
                ? `Produces +${BUILDING_STATS[kind].power} power`
                : `Uses ${Math.abs(BUILDING_STATS[kind].power)} power`}
          active={placeKind === kind}
          tutorialFocus={state.tutorialStage === "build" && kind === "power" ? "power-cameo" : undefined}
          cameo={cameo}
            shortcut={SHORTCUT.cameo[index]}
            onClick={() => onPlace(kind)}
            onContextMenu={() => onCancelBuilding(kind)}
          />
        );
      })}
    </CameoGrid>
  );
}

export function constructionBlockerText(state: SimState, kind: BuildingKind): string | undefined {
  if (buildingLimitReached(state.entities, 0, kind)) return `Only one ${labelFor(kind)} allowed per mission`;
  if (state.credits[0] < BUILDING_STATS[kind].cost) return `Need ${BUILDING_STATS[kind].cost - state.credits[0]} more credits`;
  return undefined;
}
