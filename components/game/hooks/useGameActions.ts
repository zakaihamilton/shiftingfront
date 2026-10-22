import { useCallback, useMemo, type MutableRefObject } from "react";
import { isAirUnit, isSupportUnit } from "@/lib/catalog";
import { beep } from "@/lib/audio/synth";
import { voiceBarkForBeep } from "@/lib/audio/voice";
import { groundOrders } from "@/lib/sim/orders";
import { bombardPointFor } from "@/lib/sim/verbs";
import { beepForCommands } from "@/lib/audio/uiOrders";
import type { MissionUxTelemetry } from "@/lib/persist/telemetry";
import { isPlayerSelectableUnit, type Command, type Formation, type SimState, type Stance, type UnitKind } from "@/lib/types";
import { inBounds, terrainAccess } from "@/lib/sim/world";
import { createRuntimeCommandPort, type RuntimeCommandPort } from "./runtime/facade";
import type { CommandNoticeKind } from "./useGameChrome";
import { useProductionActions } from "./useProductionActions";
import { useToolModes } from "./useToolModes";

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
  const tools = useToolModes({ stateRef, notify });
  const production = useProductionActions({
    stateRef,
    enqueue,
    notify,
    uxRef,
    placeRef: tools.place,
    setPlaceKind: tools.setPlaceKind,
    togglePlace: tools.togglePlace,
  });
  const { resetMobileCommand } = tools;

  const issueSelectedCommand = useCallback((command: "stop" | "stance" | "formation", value?: Stance | Formation) => {
    const state = stateRef.current;
    const owner = state.viewOwner ?? 0;
    const unitIds = [...(selectedIds.length > 0 ? selectedIds : selected.current)].filter((id) => {
      const entity = state.entities.find((candidate) => candidate.id === id);
      return Boolean(entity && entity.owner === owner && isPlayerSelectableUnit(entity) && !entity.neutral && entity.hp > 0);
    });
    if (unitIds.length === 0) return;
    if (command === "stop") enqueue({ type: "stop", unitIds });
    else if (command === "stance" && value) enqueue({ type: "stance", unitIds, stance: value as Stance });
    else if (command === "formation" && value) enqueue({ type: "formation", unitIds, formation: value as Formation });
    resetMobileCommand();
    beep("ack");
    voiceBarkForBeep("ack");
    if (uxRef && uxRef.current.firstOrderTick === undefined) uxRef.current.firstOrderTick = stateRef.current.tick;
    notify(command === "stop"
      ? `Stop order issued to ${unitIds.length} unit${unitIds.length === 1 ? "" : "s"}.`
      : `${command === "stance" ? "Stance" : "Formation"} updated for ${unitIds.length} unit${unitIds.length === 1 ? "" : "s"}.`, "success");
  }, [enqueue, notify, resetMobileCommand, selected, selectedIds, stateRef, uxRef]);

  const selectedOwnedUnits = useCallback((kind?: "tank" | "behemoth") => {
    const state = stateRef.current;
    const owner = state.viewOwner ?? 0;
    return [...(selectedIds.length > 0 ? selectedIds : selected.current)].flatMap((id) => {
      const entity = state.entities.find((candidate) => candidate.id === id);
      if (!entity || entity.owner !== owner || !isPlayerSelectableUnit(entity) || entity.neutral || entity.hp <= 0) return [];
      if (kind && entity.kind !== kind) return [];
      return [entity];
    });
  }, [selected, selectedIds, stateRef]);

  const issueBrace = useCallback(() => {
    const tanks = selectedOwnedUnits("tank");
    if (tanks.length === 0) {
      notify("Select a tank to brace.", "error");
      return;
    }
    enqueue({ type: "brace", unitIds: tanks.map((entity) => entity.id) });
    resetMobileCommand();
    beep("ack");
    voiceBarkForBeep("ack");
    if (uxRef && uxRef.current.firstOrderTick === undefined) uxRef.current.firstOrderTick = stateRef.current.tick;
    notify(`Brace order issued to ${tanks.length} tank${tanks.length === 1 ? "" : "s"}.`, "success");
  }, [enqueue, notify, resetMobileCommand, selectedOwnedUnits, stateRef, uxRef]);

  const issueBombard = useCallback(() => {
    const behemoths = selectedOwnedUnits("behemoth");
    if (behemoths.length === 0) {
      notify("Select a behemoth to bombard.", "error");
      return;
    }
    const state = stateRef.current;
    const aimed = behemoths.find((entity) => entity.attackTarget !== undefined);
    const target = aimed?.attackTarget === undefined
      ? undefined
      : state.entities.find((entity) => entity.id === aimed.attackTarget && entity.hp > 0);
    if (!target) {
      notify("Attack a target, then bombard.", "error");
      return;
    }
    const shooters = aimed ? [aimed, ...behemoths.filter((entity) => entity !== aimed)] : behemoths;
    const point = bombardPointFor(state, shooters, target);
    if (!point) {
      notify("The target is out of range.", "error");
      return;
    }
    enqueue({ type: "bombard", unitIds: behemoths.map((entity) => entity.id), x: point.x, y: point.y });
    resetMobileCommand();
    beep("ack");
    voiceBarkForBeep("ack");
    if (uxRef && uxRef.current.firstOrderTick === undefined) uxRef.current.firstOrderTick = state.tick;
    notify("Bombard order issued.", "success");
  }, [enqueue, notify, resetMobileCommand, selectedOwnedUnits, stateRef, uxRef]);

  const issueCoordinateCommand = useCallback((command: "move" | "attackMove" | "harvest", x: number, y: number) => {
    const tx = Math.round(x);
    const ty = Math.round(y);
    const state = stateRef.current;
    const owner = state.viewOwner ?? 0;
    const selectedUnitIds = [...(selectedIds.length > 0 ? selectedIds : selected.current)];
    const unitIds = selectedUnitIds.filter((id) => {
      const entity = state.entities.find((candidate) => candidate.id === id);
      if (!entity || entity.owner !== owner || !isPlayerSelectableUnit(entity) || entity.neutral || entity.hp <= 0) return false;
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
      ? groundOrders(state, unitIds, tx, ty, false)
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
    const owner = stateRef.current.viewOwner ?? 0;
    const selectedUnitIds = [...(selectedIds.length > 0 ? selectedIds : selected.current)];
    const unitIds = selectedUnitIds.filter((id) => {
      const entity = stateRef.current.entities.find((candidate) => candidate.id === id);
      if (!entity || entity.owner !== owner || !isPlayerSelectableUnit(entity) || entity.neutral || entity.hp <= 0) return false;
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

  return {
    ...tools,
    issueSelectedCommand,
    issueBrace,
    issueBombard,
    issueCoordinateCommand,
    issueTargetCommand,
    ...production,
  };
}

export type GameActions = ReturnType<typeof useGameActions>;
