import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import { buildingCameoStatus, buildingLimitReached, isAirUnit, isSupportUnit, unitCameoStatus } from "@/lib/catalog";
import { beep } from "@/lib/audio/synth";
import { voiceBarkForBeep } from "@/lib/audio/voice";
import { groundOrders } from "@/lib/sim/orders";
import { beepForCommands } from "@/lib/audio/uiOrders";
import type { MissionUxTelemetry } from "@/lib/persist/telemetry";
import { isPlayerSelectableUnit, type BuildingKind, type Command, type Formation, type SimState, type Stance, type UnitKind } from "@/lib/types";
import { inBounds, terrainAccess } from "@/lib/sim/world";
import type { MobileCommand } from "../mobileCommandTypes";
import { PLACEABLE, PRODUCIBLE, leastLoadedProducer } from "./gameActions";
import { createRuntimeCommandPort, type RuntimeCommandPort } from "./runtime/facade";
import type { CommandNoticeKind } from "./useGameChrome";

export { PLACEABLE, PRODUCIBLE } from "./gameActions";

export function useGameActions({
  stateRef,
  commandPort,
  cmdQ,
  selected,
  selectedIds,
  onCommandNotice,
  onCommandRejection,
  uxRef,
}: {
  stateRef: MutableRefObject<SimState>;
  commandPort?: RuntimeCommandPort;
  /** Compatibility input for isolated hook consumers. */
  cmdQ?: MutableRefObject<Command[]>;
  selected: MutableRefObject<Set<number>>;
  selectedIds: readonly number[];
  onCommandNotice?: (text: string, kind?: CommandNoticeKind) => void;
  onCommandRejection?: (reason: string) => void;
  uxRef?: MutableRefObject<MissionUxTelemetry>;
}) {
  const resolvedCommandPort = useMemo(() => {
    if (commandPort) return commandPort;
    if (!cmdQ) throw new Error("useGameActions requires a runtime command port");
    return createRuntimeCommandPort(cmdQ);
  }, [cmdQ, commandPort]);
  const enqueue = useCallback((command: Command) => {
    resolvedCommandPort.enqueue(command);
  }, [resolvedCommandPort]);
  const notify = useCallback((text: string, kind: CommandNoticeKind = "info") => {
    if (kind === "error") onCommandRejection?.(text);
    onCommandNotice?.(text, kind);
  }, [onCommandNotice, onCommandRejection]);
  const place = useRef<BuildingKind | null>(null);
  const [placeKind, setPlaceKind] = useState<BuildingKind | null>(null);
  const repair = useRef(false);
  const [repairMode, setRepairMode] = useState(false);
  const sell = useRef(false);
  const [sellMode, setSellMode] = useState(false);
  const mobileCommand = useRef<MobileCommand | null>(null);
  const [mobileCommandState, setMobileCommandState] = useState<MobileCommand | null>(null);

  const clearTools = useCallback(() => {
    place.current = null;
    setPlaceKind(null);
    repair.current = false;
    setRepairMode(false);
    sell.current = false;
    setSellMode(false);
  }, []);

  const chooseMobileCommand = useCallback((command: MobileCommand) => {
    clearTools();
    mobileCommand.current = command;
    setMobileCommandState(command);
    beep("select");
    voiceBarkForBeep("select");
    notify(`${command === "attackMove" ? "Attack-move" : command.charAt(0).toUpperCase() + command.slice(1)} ready — tap a destination.`, "info");
  }, [clearTools, notify]);

  const cancelMobileCommand = useCallback(() => {
    mobileCommand.current = null;
    setMobileCommandState(null);
    clearTools();
    beep("cancel");
    notify("Command cancelled.", "info");
  }, [clearTools, notify]);

  const resetMobileCommand = useCallback(() => {
    mobileCommand.current = null;
    setMobileCommandState(null);
  }, []);

  const issueSelectedCommand = useCallback((command: "stop" | "stance" | "formation", value?: Stance | Formation) => {
    const state = stateRef.current;
    const unitIds = [...(selectedIds.length > 0 ? selectedIds : selected.current)].filter((id) => {
      const entity = state.entities.find((candidate) => candidate.id === id);
      return Boolean(entity && entity.owner === 0 && isPlayerSelectableUnit(entity) && !entity.neutral && entity.hp > 0);
    });
    if (unitIds.length === 0) return;
    if (command === "stop") enqueue({ type: "stop", unitIds });
    else if (command === "stance" && value) enqueue({ type: "stance", unitIds, stance: value as Stance });
    else if (command === "formation" && value) enqueue({ type: "formation", unitIds, formation: value as Formation });
    mobileCommand.current = null;
    setMobileCommandState(null);
    beep("ack");
    voiceBarkForBeep("ack");
    if (uxRef && uxRef.current.firstOrderTick === undefined) uxRef.current.firstOrderTick = stateRef.current.tick;
    notify(command === "stop"
      ? `Stop order issued to ${unitIds.length} unit${unitIds.length === 1 ? "" : "s"}.`
      : `${command === "stance" ? "Stance" : "Formation"} updated for ${unitIds.length} unit${unitIds.length === 1 ? "" : "s"}.`, "success");
  }, [enqueue, notify, selected, selectedIds, stateRef, uxRef]);

  const issueCoordinateCommand = useCallback((command: "move" | "attackMove" | "harvest", x: number, y: number) => {
    const tx = Math.round(x);
    const ty = Math.round(y);
    const state = stateRef.current;
    const selectedUnitIds = [...(selectedIds.length > 0 ? selectedIds : selected.current)];
    const unitIds = selectedUnitIds.filter((id) => {
      const entity = state.entities.find((candidate) => candidate.id === id);
      if (!entity || entity.owner !== 0 || !isPlayerSelectableUnit(entity) || entity.neutral || entity.hp <= 0) return false;
      if (command === "harvest") return entity.kind === "harvester";
      if (command === "attackMove") return entity.kind !== "harvester";
      return true;
    });
    const access = terrainAccess(state, tx, ty);
    const groundOrder = unitIds.some((id) => {
      const entity = state.entities.find((candidate) => candidate.id === id);
      return !entity || entity.class !== "unit" || !isAirUnit(entity.kind);
    });
    if (!unitIds.length || !Number.isInteger(tx) || !Number.isInteger(ty) || !inBounds(state, tx, ty) ||
      (groundOrder && !access.traversable) || (command === "harvest" && access.label !== "Ore field")) {
      notify(command === "harvest" ? "Select an ore field for harvesting." : "That destination cannot be reached.", "error");
      return false;
    }
    const commands = command === "move"
      ? groundOrders(state, unitIds, tx, ty, true)
      : [{ type: command, unitIds, x: tx, y: ty } satisfies Command];
    if (!commands.length) {
      notify("No eligible units for that order.", "error");
      return false;
    }
    resolvedCommandPort.enqueueMany(commands);
    if (uxRef && uxRef.current.firstOrderTick === undefined) uxRef.current.firstOrderTick = state.tick;
    const kind = beepForCommands(commands);
    if (kind) {
      beep(kind);
      voiceBarkForBeep(kind);
    }
    notify(`${command === "attackMove" ? "Attack-move" : command.charAt(0).toUpperCase() + command.slice(1)} order issued.`, "success");
    return true;
  }, [notify, resolvedCommandPort, selected, selectedIds, stateRef, uxRef]);

  const issueTargetCommand = useCallback((command: "attack" | "support", targetId: number) => {
    const selectedUnitIds = [...(selectedIds.length > 0 ? selectedIds : selected.current)];
    const unitIds = selectedUnitIds.filter((id) => {
      const entity = stateRef.current.entities.find((candidate) => candidate.id === id);
      if (!entity || entity.owner !== 0 || !isPlayerSelectableUnit(entity) || entity.neutral || entity.hp <= 0) return false;
      if (command === "attack") return entity.kind !== "harvester" && !isSupportUnit(entity.kind as UnitKind);
      return isSupportUnit(entity.kind as UnitKind);
    });
    if (!unitIds.length) {
      notify(command === "attack" ? "Select a combat unit first." : "Select a support unit first.", "error");
      return false;
    }
    const nextCommand = { type: command, unitIds, targetId } satisfies Command;
    enqueue(nextCommand);
    if (uxRef && uxRef.current.firstOrderTick === undefined) uxRef.current.firstOrderTick = stateRef.current.tick;
    const kind = beepForCommands([nextCommand]);
    if (kind) {
      beep(kind);
      voiceBarkForBeep(kind);
    }
    notify(`${command === "attack" ? "Attack" : "Support"} order issued.`, "success");
    return true;
  }, [enqueue, notify, selected, selectedIds, stateRef, uxRef]);

  const togglePlace = useCallback((kind: BuildingKind) => {
    if (place.current !== kind && buildingLimitReached(stateRef.current.entities, 0, kind)) {
      notify("This structure is limited to one per mission.", "error");
      return;
    }
    const next = place.current === kind ? null : kind;
    place.current = next;
    setPlaceKind(next);
    if (next) {
      repair.current = false;
      setRepairMode(false);
      sell.current = false;
      setSellMode(false);
    }
    if (next) notify("Placement mode ready — choose a build site.", "info");
  }, [notify, stateRef]);

  const toggleRepair = useCallback(() => {
    const next = !repair.current;
    repair.current = next;
    setRepairMode(next);
    if (next) {
      place.current = null;
      setPlaceKind(null);
      sell.current = false;
      setSellMode(false);
    }
    notify(next ? "Repair mode ready." : "Repair mode cancelled.", "info");
  }, [notify]);

  const toggleSell = useCallback(() => {
    const next = !sell.current;
    sell.current = next;
    setSellMode(next);
    if (next) {
      place.current = null;
      setPlaceKind(null);
      repair.current = false;
      setRepairMode(false);
    }
    notify(next ? "Sell mode ready." : "Sell mode cancelled.", "info");
  }, [notify]);

  const cancelBuilding = useCallback((kind: BuildingKind) => {
    if (place.current === kind) {
      place.current = null;
      setPlaceKind(null);
      beep("cancel");
      notify("Placement cancelled.", "info");
      return;
    }
    if (buildingCameoStatus(stateRef.current.entities, 0, kind).phase === "idle") return;
    enqueue({ type: "cancelBuild", building: kind });
    beep("cancel");
    notify("Construction cancelled.", "info");
  }, [enqueue, notify, stateRef]);

  const availableProducer = useCallback((unit: UnitKind) => leastLoadedProducer(stateRef.current, 0, unit), [stateRef]);

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
    if (unitCameoStatus(stateRef.current.entities, 0, unit).phase === "idle") return;
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

  return {
    place,
    placeRef: place,
    placeKind,
    setPlaceKind,
    repair,
    repairRef: repair,
    repairMode,
    setRepairMode,
    sell,
    sellRef: sell,
    sellMode,
    setSellMode,
    mobileCommand,
    mobileCommandRef: mobileCommand,
    mobileCommandState,
    setMobileCommandState,
    clearTools,
    chooseMobileCommand,
    cancelMobileCommand,
    resetMobileCommand,
    issueSelectedCommand,
    issueCoordinateCommand,
    issueTargetCommand,
    togglePlace,
    toggleRepair,
    toggleSell,
    cancelBuilding,
    availableProducer,
    queueUnit,
    cancelUnit,
    activateCameo,
  };
}

export type GameActions = ReturnType<typeof useGameActions>;
