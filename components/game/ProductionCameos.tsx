import { TICKS_PER_SECOND, UNIT_STATS, isSupportUnit, isUnitAvailable, isUnitKind, labelFor, producerFor, unitCameoStatus } from "@/lib/catalog";
import type { Entity, FactionVisualProfile, Palette, SimState, UnitKind } from "@/lib/types";
import { SHORTCUT } from "@/lib/ui/shortcuts";
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
        const cameo = unitCameoStatus(state.entities, 0, unit);
        const producer = availableProducer(unit);
        const canBuy = isUnitAvailable(unit, state.missionIndex)
          && state.credits[0] >= UNIT_STATS[unit].cost && !!producer && power >= 0;
        const disabled = cameo.phase === "idle" && !canBuy;
        const recommendation = supportRecommendationText(state, unit);
        return (
          <CommandCameo
            key={unit}
            kind={unit}
            palette={palette}
            profile={profile}
            cost={UNIT_STATS[unit].cost}
            disabled={disabled}
          disabledReason={disabled ? productionBlockerText(state, unit, power, producer) : undefined}
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
    entity.owner === 0 && entity.class === "unit" && isUnitKind(entity.kind) && entity.hp > 0 && !entity.neutral && !isSupportUnit(entity.kind) &&
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
  if (!isUnitAvailable(unit, state.missionIndex)) return "Advance the campaign to unlock this unit";

  const blockers: string[] = [];
  const producerKind = producerFor(unit);
  const producerEntities = state.entities.filter(
    (entity) => entity.hp > 0 && entity.owner === 0 && entity.class === "building" && entity.kind === producerKind,
  );

  if (!producer) {
    const finishedProducer = producerEntities.some((entity) => entity.constructing <= 0);
    blockers.push(
      finishedProducer
        ? `Wait for a ${labelFor(producerKind)} production slot`
        : producerEntities.length > 0
          ? `Finish a ${labelFor(producerKind)}`
          : `Build a ${labelFor(producerKind)}`,
    );
  }
  if (state.credits[0] < UNIT_STATS[unit].cost) {
    blockers.push(`Need ${UNIT_STATS[unit].cost - state.credits[0]} more credits`);
  }
  if (power < 0) blockers.push("Restore power");

  return blockers.join(" · ");
}
