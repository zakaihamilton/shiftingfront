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
        const cameo = buildingCameoStatus(state.entities, state.viewOwner ?? 0, kind);
        const blocker = cameo.phase === "idle" ? constructionBlockerCopy(state, kind) : undefined;
        return (
          <CommandCameo
            key={kind}
            kind={kind}
            palette={palette}
            profile={profile}
            cost={BUILDING_STATS[kind].cost}
            disabled={blocker !== undefined}
            disabledReason={blocker?.reason}
            statusLabel={blocker?.status}
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
  return constructionBlockerCopy(state, kind)?.reason;
}

function constructionBlockerCopy(state: SimState, kind: BuildingKind): { reason: string; status: string } | undefined {
  if (buildingLimitReached(state.entities, state.viewOwner ?? 0, kind)) {
    return { reason: `Only one ${labelFor(kind)} allowed per mission`, status: "Limit reached" };
  }
  const ownerCredits = state.credits[state.viewOwner ?? 0];
  if (ownerCredits < BUILDING_STATS[kind].cost) {
    const shortfall = BUILDING_STATS[kind].cost - ownerCredits;
    return { reason: `Need ${shortfall} more credits`, status: `Need ${shortfall} cr` };
  }
  return undefined;
}
