import { TICKS_PER_SECOND, UNIT_STATS, isSupportUnit, isUnitAvailable, isUnitKind, labelFor, producerFor, unitCameoStatus } from "@/lib/catalog";
import type { Entity, FactionVisualProfile, Palette, SimState, UnitKind } from "@/lib/types";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import { isSharedProducerKind, readSharedProductionQueue } from "@/lib/sim/producerState";
import { CameoGrid } from "./CameoGrid";
import { CommandCameo } from "./CommandCameo";
import { PRODUCIBLE } from "./hooks/useGameActions";

export function ProductionCameos({
  state,
  palette,
  profile,
  power,
  availableProducer,
  onQueueUnit,
  onCancelUnit,
}: {
  state: SimState;
  palette: Palette;
  profile: FactionVisualProfile;
  power: number;
  availableProducer: (unit: UnitKind) => Entity | undefined;
  onQueueUnit: (unit: UnitKind) => void;
  onCancelUnit: (unit: UnitKind) => void;
}) {
  return (
    <CameoGrid>
      {PRODUCIBLE.map((unit, index) => {
        const owner = state.viewOwner ?? 0;
        const ownerCredits = state.credits[owner];
        const producerKind = producerFor(unit);
        const sharedQueue = isSharedProducerKind(producerKind)
          ? readSharedProductionQueue(state, owner, producerKind)
          : undefined;
        const cameo = unitCameoStatus(state.entities, owner, unit, sharedQueue);
        const producer = availableProducer(unit);
        const canBuy = isUnitAvailable(unit, state.missionIndex)
          && ownerCredits >= UNIT_STATS[unit].cost && !!producer && power >= 0;
        const disabled = cameo.phase === "idle" && !canBuy;
        const blocker = disabled ? productionBlockerCopy(state, unit, power, producer) : undefined;
        const recommendation = supportRecommendationText(state, unit);
        return (
          <CommandCameo
            key={unit}
            kind={unit}
            palette={palette}
            profile={profile}
            cost={UNIT_STATS[unit].cost}
            disabled={disabled}
            disabledReason={blocker?.reason}
            statusLabel={blocker?.status}
            detail={cameo.phase === "progress"
              ? `${Math.ceil((1 - cameo.ratio) * UNIT_STATS[unit].buildTicks / TICKS_PER_SECOND)}s remaining`
              : cameo.phase === "waiting" ? "Queued — cancel available" : recommendation}
            cameo={cameo}
            tutorialFocus={state.tutorialStage === "produce" && unit === "infantry" ? "infantry-cameo" : undefined}
            shortcut={SHORTCUT.cameo[index]}
            onClick={() => onQueueUnit(unit)}
            onContextMenu={() => onCancelUnit(unit)}
          />
        );
      })}
    </CameoGrid>
  );
}

export function supportRecommendationText(state: SimState, unit: UnitKind): string | undefined {
  if (unit !== "medic" && unit !== "repairTruck") return undefined;
  const domain = unit === "medic" ? "human" : "vehicle";
  const wounded = state.entities.filter((entity) =>
    entity.owner === (state.viewOwner ?? 0) && entity.class === "unit" && isUnitKind(entity.kind) && entity.hp > 0 && !entity.neutral && !isSupportUnit(entity.kind) &&
    UNIT_STATS[entity.kind].domain === domain && entity.hp < entity.maxHp,
  ).length;
  return wounded > 0 ? `Recommended · ${wounded} damaged ${domain} unit${wounded === 1 ? "" : "s"}` : undefined;
}

export function productionBlockerText(
  state: SimState,
  unit: UnitKind,
  power: number,
  producer: Entity | undefined,
): string {
  return productionBlockerCopy(state, unit, power, producer).reason;
}

function productionBlockerCopy(
  state: SimState,
  unit: UnitKind,
  power: number,
  producer: Entity | undefined,
): { reason: string; status: string } {
  if (!isUnitAvailable(unit, state.missionIndex)) {
    return { reason: "Advance the campaign to unlock this unit", status: "Locked" };
  }

  const blockers: string[] = [];
  let status: string | undefined;
  const producerKind = producerFor(unit);
  const producerEntities = state.entities.filter(
    (entity) => entity.hp > 0 && entity.owner === (state.viewOwner ?? 0) && entity.class === "building" && entity.kind === producerKind,
  );

  if (!producer) {
    const finishedProducer = producerEntities.some((entity) => entity.constructing <= 0);
    if (finishedProducer) {
      blockers.push(`Wait for a ${labelFor(producerKind)} production slot`);
      status = "Slot busy";
    } else if (producerEntities.length > 0) {
      blockers.push(`Finish a ${labelFor(producerKind)}`);
      status = `Finish ${compactProducerLabel(producerKind)}`;
    } else {
      blockers.push(`Build a ${labelFor(producerKind)}`);
      status = `Needs ${compactProducerLabel(producerKind)}`;
    }
  }
  const ownerCredits = state.credits[state.viewOwner ?? 0];
  if (ownerCredits < UNIT_STATS[unit].cost) {
    const shortfall = UNIT_STATS[unit].cost - ownerCredits;
    blockers.push(`Need ${shortfall} more credits`);
    status ??= `Need ${shortfall} cr`;
  }
  if (power < 0) {
    blockers.push("Restore power");
    status ??= "Low power";
  }

  return { reason: blockers.join(" · "), status: status ?? "Ready" };
}

function compactProducerLabel(kind: ReturnType<typeof producerFor>): string {
  if (kind === "factory") return "plant";
  if (kind === "runway") return "runway";
  if (kind === "barracks") return "barracks";
  return labelFor(kind).toLowerCase();
}
