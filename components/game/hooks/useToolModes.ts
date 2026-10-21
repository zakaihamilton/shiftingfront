import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { buildingLimitReached } from "@/lib/catalog";
import { beep } from "@/lib/audio/synth";
import { voiceBarkForBeep } from "@/lib/audio/voice";
import type { BuildingKind, SimState } from "@/lib/types";
import type { MobileCommand } from "../mobileCommandTypes";
import type { CommandNoticeKind } from "./useGameChrome";

export function useToolModes({
  stateRef,
  notify,
}: {
  stateRef: MutableRefObject<SimState>;
  notify: (text: string, kind?: CommandNoticeKind) => void;
}) {
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

  const togglePlace = useCallback((kind: BuildingKind) => {
    const owner = stateRef.current.viewOwner ?? 0;
    if (place.current !== kind && buildingLimitReached(stateRef.current.entities, owner, kind)) {
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
    togglePlace,
    toggleRepair,
    toggleSell,
  };
}
