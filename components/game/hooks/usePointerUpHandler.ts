import { useCallback, useMemo, type MutableRefObject, type PointerEvent } from "react";
import { beep } from "@/lib/audio/synth";
import { voiceBarkForBeep } from "@/lib/audio/voice";
import type { BuildingKind, Command, SimState } from "@/lib/types";
import type { MobileCommand } from "../mobileCommandTypes";
import { canvasPointerPos } from "./canvasPointer";
import type { SelectionBox } from "./selectionBox";
import type { PointerUpEffect } from "./gamePointerUp";
import { createRuntimeCommandPort, type RuntimeCommandPort } from "./runtime/facade";
import type { MissionUxTelemetry } from "@/lib/persist/telemetry";
import { triggerHaptic } from "@/lib/ui/haptics";

export function usePointerUpHandler({
  stateRef,
  commandPort,
  cmdQRef,
  boxRef,
  commitSelection,
  setSelectionMode,
  mobileCommandRef,
  setMobileCommandState,
  placeRef,
  setPlaceKind,
  repairRef,
  setRepairMode,
  sellRef,
  setSellMode,
  markUnitCommand,
  markInvalidCommand,
  syncCursor,
  onCommandNotice,
  onCommandRejection,
  uxRef,
}: {
  stateRef: MutableRefObject<SimState>;
  commandPort?: RuntimeCommandPort;
  /** Compatibility input for isolated hook consumers. */
  cmdQRef?: MutableRefObject<Command[]>;
  boxRef: MutableRefObject<SelectionBox | null>;
  commitSelection: (ids: number[]) => void;
  setSelectionMode: (active: boolean) => void;
  mobileCommandRef: MutableRefObject<MobileCommand | null>;
  setMobileCommandState: (v: MobileCommand | null) => void;
  placeRef: MutableRefObject<BuildingKind | null>;
  setPlaceKind: (v: BuildingKind | null) => void;
  repairRef: MutableRefObject<boolean>;
  setRepairMode: (v: boolean) => void;
  sellRef: MutableRefObject<boolean>;
  setSellMode: (v: boolean) => void;
  markUnitCommand: (s: SimState, p: { x: number; y: number }, commands: Command[]) => void;
  markInvalidCommand: (s: SimState, p: { x: number; y: number }) => void;
  syncCursor: (canvas?: HTMLCanvasElement | null) => void;
  onCommandNotice?: (text: string, kind?: "success" | "info" | "warning" | "error") => void;
  onCommandRejection?: (reason: string) => void;
  uxRef?: MutableRefObject<MissionUxTelemetry>;
}) {
  const resolvedCommandPort = useMemo(() => {
    if (commandPort) return commandPort;
    if (!cmdQRef) throw new Error("usePointerUpHandler requires a runtime command port");
    return createRuntimeCommandPort(cmdQRef);
  }, [cmdQRef, commandPort]);
  const applyPointerUp = useCallback((effect: PointerUpEffect, event: PointerEvent<HTMLCanvasElement>) => {
    if (effect.preventDefault) event.preventDefault();
    if (effect.clearBox) boxRef.current = null;
    if (effect.commands?.length) {
      resolvedCommandPort.enqueueMany(effect.commands);
      markUnitCommand(stateRef.current, canvasPointerPos(event), effect.commands);
      if (effect.commands.some((command) => command.type === "build")) {
        triggerHaptic("deploy");
      } else {
        triggerHaptic("order");
      }
      if (uxRef && effect.commands.some((command) => command.type === "build") && uxRef.current.firstBuildTick === undefined) {
        uxRef.current.firstBuildTick = stateRef.current.tick;
      }
      if (uxRef && effect.commands.some((command) => ("unitIds" in command && command.unitIds.length > 0)) && uxRef.current.firstOrderTick === undefined) {
        uxRef.current.firstOrderTick = stateRef.current.tick;
      }
    }
    if (effect.commandNotice) {
      const isBuildPlacement = effect.commands?.some((command) => command.type === "build") ?? false;
      if (effect.commandNotice.kind === "error" && !isBuildPlacement) {
        markInvalidCommand(stateRef.current, canvasPointerPos(event));
        triggerHaptic("alert");
      }
      if (effect.commandNotice.kind === "error" && !effect.commands?.length) onCommandRejection?.(effect.commandNotice.text);
      onCommandNotice?.(effect.commandNotice.text, effect.commandNotice.kind);
    }
    if (effect.select) {
      commitSelection(effect.select);
      if (effect.select.length > 0) {
        triggerHaptic("selection");
      }
    }
    if (effect.endSelectionMode) setSelectionMode(false);
    if (effect.clearMobileCommand) {
      mobileCommandRef.current = null;
      setMobileCommandState(null);
    }
    if (effect.clearPlace) {
      placeRef.current = null;
      setPlaceKind(null);
    }
    if (effect.clearRepairAndSell) {
      repairRef.current = false;
      setRepairMode(false);
      sellRef.current = false;
      setSellMode(false);
    }
    if (effect.beep) {
      beep(effect.beep);
      voiceBarkForBeep(effect.beep);
    }
    syncCursor(event.currentTarget);
  }, [
    boxRef,
    resolvedCommandPort,
    commitSelection,
    markUnitCommand,
    markInvalidCommand,
    mobileCommandRef,
    onCommandNotice,
    onCommandRejection,
    placeRef,
    repairRef,
    sellRef,
    setMobileCommandState,
    setPlaceKind,
    setRepairMode,
    setSelectionMode,
    setSellMode,
    stateRef,
    syncCursor,
    uxRef,
  ]);

  return { applyPointerUp };
}
