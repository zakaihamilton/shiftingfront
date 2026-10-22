import { useCallback, type MutableRefObject } from "react";
import { buildingCameoStatus, producerFor, unitCameoStatus } from "@/lib/catalog";
import { beep } from "@/lib/audio/synth";
import { isSharedProducerKind, readSharedProductionQueue } from "@/lib/sim/producerState";
import type { MissionUxTelemetry } from "@/lib/persist/telemetry";
import type { BuildingKind, Command, SimState, UnitKind } from "@/lib/types";
import { PLACEABLE, PRODUCIBLE, productionBuildingFor } from "./gameActions";
import type { CommandNoticeKind } from "./useGameChrome";

export function useProductionActions({
  stateRef,
  enqueue,
  notify,
  uxRef,
  placeRef,
  setPlaceKind,
  togglePlace,
}: {
  stateRef: MutableRefObject<SimState>;
  enqueue: (command: Command) => void;
  notify: (text: string, kind?: CommandNoticeKind) => void;
  uxRef?: MutableRefObject<MissionUxTelemetry>;
  placeRef: MutableRefObject<BuildingKind | null>;
  setPlaceKind: (kind: BuildingKind | null) => void;
  togglePlace: (kind: BuildingKind) => void;
}) {
  const cancelBuilding = useCallback((kind: BuildingKind) => {
    if (placeRef.current === kind) {
      placeRef.current = null;
      setPlaceKind(null);
      beep("cancel");
      notify("Placement cancelled.", "info");
      return;
    }
    if (buildingCameoStatus(stateRef.current.entities, stateRef.current.viewOwner ?? 0, kind).phase === "idle") return;
    enqueue({ type: "cancelBuild", building: kind });
    beep("cancel");
    notify("Construction cancelled.", "info");
  }, [enqueue, notify, placeRef, setPlaceKind, stateRef]);

  const availableProducer = useCallback((unit: UnitKind) => productionBuildingFor(stateRef.current, stateRef.current.viewOwner ?? 0, unit), [stateRef]);

  const queueUnit = useCallback((unit: UnitKind) => {
    const next = availableProducer(unit);
    if (!next) {
      notify("No production slot is available.", "error");
      return;
    }
    enqueue({ type: "produce", fromId: next.id, unit });
    beep("build");
    if (uxRef && uxRef.current.firstProductionTick === undefined) uxRef.current.firstProductionTick = stateRef.current.tick;
    notify(`${unit} queued for production.`, "success");
  }, [availableProducer, enqueue, notify, stateRef, uxRef]);

  const cancelUnit = useCallback((unit: UnitKind) => {
    const state = stateRef.current;
    const owner = state.viewOwner ?? 0;
    const producerKind = producerFor(unit);
    const sharedQueue = isSharedProducerKind(producerKind)
      ? readSharedProductionQueue(state, owner, producerKind)
      : undefined;
    if (unitCameoStatus(state.entities, owner, unit, sharedQueue).phase === "idle") return;
    enqueue({ type: "cancelProduce", unit });
    beep("cancel");
    notify(`${unit} production cancelled.`, "info");
  }, [enqueue, notify, stateRef]);

  const activateCameo = useCallback((tab: "construction" | "production", index: number, cancel: boolean) => {
    if (tab === "construction") {
      const kind = PLACEABLE[index];
      if (!kind) return;
      if (cancel) cancelBuilding(kind);
      else togglePlace(kind);
      return;
    }
    const unit = PRODUCIBLE[index];
    if (!unit) return;
    if (cancel) cancelUnit(unit);
    else queueUnit(unit);
  }, [cancelBuilding, cancelUnit, queueUnit, togglePlace]);

  return { cancelBuilding, availableProducer, queueUnit, cancelUnit, activateCameo };
}
