import { startLoop, type LoopHandle } from "@/lib/game/loop";
import { TICKS_PER_SECOND } from "@/lib/catalog";
import { tick } from "@/lib/sim/api";
import type { SimEvent, SimState } from "@/lib/types";
import { canonicalCommandRejectionReason, type MissionUxTelemetry } from "@/lib/persist/telemetry";
import { createFrameCoordinator } from "./frame";
import { createPersistenceCoordinator } from "./persistence";
import { createPresentationCoordinator } from "./presentation";
import type { RuntimeController, RuntimePorts, RuntimeRefs } from "./types";

const AUTOSAVE_INTERVAL_TICKS = 30 * TICKS_PER_SECOND;

function createRuntimeUxTelemetry(): MissionUxTelemetry {
  return {
    briefingSkipped: false,
    controlsOpened: 0,
    tutorialCompleted: false,
    tutorialExited: false,
    mobilePanelOpened: 0,
    objectivePanelToggles: 0,
    commandFeedbackCount: 0,
    commandRejectionsByReason: {},
  };
}

export function createRuntimeController(refs: RuntimeRefs, ports: RuntimePorts): RuntimeController {
  let loop: LoopHandle | null = null;
  let started = false;
  const lifecycle = refs.lifecycleRef.current;

  const persistence = createPersistenceCoordinator({
    stateRef: refs.stateRef,
    terminalSaveRef: refs.terminalSaveRef,
    campaignRecordedRef: refs.campaignRecordedRef,
    saveSession: ports.saveSession,
    persistCampaign: ports.persistCampaign,
    onAlert: ports.onAlert,
    persistenceRef: refs.persistenceRef,
    suppressImplicitSavesRef: refs.suppressImplicitSavesRef,
  });
  const presentation = createPresentationCoordinator({
    cameraRef: refs.cameraRef,
    canvasRef: refs.canvasRef,
    fxRef: refs.fxRef,
    fxSequence: refs.fxSequence,
    screenShakeRef: refs.screenShakeRef,
    onAlert: ports.onAlert,
    onCommandNotice: ports.onCommandNotice,
  });
  const frame = createFrameCoordinator({
    cameraRef: refs.cameraRef,
    canvasRef: refs.canvasRef,
    keys: refs.keys,
    edgePanHover: refs.edgePanHover,
    panHold: refs.panHold,
    panAvailabilityRef: refs.panAvailabilityRef,
    setPanAvailability: ports.setPanAvailability,
    applyEdgePan: ports.applyEdgePan,
  });

  const syncSession = (state: SimState) => {
    if (lifecycle.sessionState === state) return;
    const isInitialSession = lifecycle.sessionState === null;
    lifecycle.sessionState = state;
    lifecycle.terminalPresented = refs.terminalSaveRef.current;
    lifecycle.commandApplied = false;
    lifecycle.counters.commandsIssued = 0;
    lifecycle.counters.commandRejections = 0;
    const briefingSkipped = isInitialSession && refs.uxRef.current.briefingSkipped;
    lifecycle.counters.ux = refs.uxRef.current = {
      ...createRuntimeUxTelemetry(),
      briefingSkipped,
    };
    lifecycle.counters.firstCombatTick = undefined;
    lifecycle.counters.firstPressureTick = undefined;
    lifecycle.counters.firstHqThreatTick = undefined;
    lifecycle.counters.hqHealthAtPressure = undefined;
    lifecycle.counters.hqHealthAtEnd = undefined;
    lifecycle.counters.primaryCompletedTick = undefined;
    lifecycle.counters.assaultTransitions = 0;
    lifecycle.counters.lastAiState = undefined;
    persistence.reset();
    presentation.reset();
  };

  const controller: RuntimeController = {
    start() {
      if (started) return;
      started = true;
      syncSession(refs.stateRef.current);
      persistence.start();
      loop = startLoop({
        getState: () => refs.stateRef.current,
        setState: (state) => {
          refs.stateRef.current = state;
        },
        drainCommands: controller.drainCommands,
        step: tick,
        isPaused: () => refs.pausedRef.current,
        onTick: controller.onTick,
        onFrame: controller.onFrame,
      });
    },
    stop() {
      if (!started) return;
      started = false;
      persistence.stop();
      loop?.stop();
      loop = null;
    },
    drainCommands() {
      syncSession(refs.stateRef.current);
      const commands = refs.commandQueue.current.splice(0, refs.commandQueue.current.length);
      lifecycle.commandApplied = commands.length > 0;
      lifecycle.counters.commandsIssued += commands.length;
      return commands;
    },
    onTick(state: SimState, events: SimEvent[], now: number) {
      syncSession(state);
      lifecycle.counters.commandRejections += events.filter((event) => event.type === "commandRejected").length;
      for (const event of events) {
        if (event.type === "commandRejected") {
          const reason = canonicalCommandRejectionReason(event.reason);
          lifecycle.counters.ux.commandRejectionsByReason[reason] = (lifecycle.counters.ux.commandRejectionsByReason[reason] ?? 0) + 1;
        }
      }
      if (lifecycle.counters.firstCombatTick === undefined && events.some((event) => event.type === "combat" && event.owner === 0)) {
        lifecycle.counters.firstCombatTick = state.tick;
      }
      const directorPhase = state.runtime?.director?.phase;
      if (lifecycle.counters.firstPressureTick === undefined && directorPhase !== undefined && directorPhase !== "opening") {
        lifecycle.counters.firstPressureTick = state.tick;
        const yard = state.entities.find((entity) => entity.owner === 0 && entity.class === "building" && entity.kind === "constructionYard");
        if (yard) lifecycle.counters.hqHealthAtPressure = yard.hp / Math.max(1, yard.maxHp);
      }
      if (lifecycle.counters.firstHqThreatTick === undefined) {
        const yard = state.entities.find((entity) => entity.owner === 0 && entity.class === "building" && entity.kind === "constructionYard");
        if (yard && state.entities.some((entity) => entity.owner === 1 && entity.attackTarget === yard.id)) {
          lifecycle.counters.firstHqThreatTick = state.tick;
        }
      }
      if (state.aiState === "assault" && lifecycle.counters.lastAiState !== "assault") {
        lifecycle.counters.assaultTransitions += 1;
      }
      lifecycle.counters.lastAiState = state.aiState;
      if (state.result === "won" && lifecycle.counters.primaryCompletedTick === undefined) {
        lifecycle.counters.primaryCompletedTick = state.tick;
      }
      if (state.tick % AUTOSAVE_INTERVAL_TICKS === 0) persistence.scheduleAutosave();
      if (lifecycle.commandApplied || state.tick % 6 === 0) {
        lifecycle.commandApplied = false;
        ports.setState({ ...state, entities: [...state.entities] });
      }
      presentation.onTick(state, events, now);
    },
    onFrame(now: number, state: SimState, paused: boolean, subTickAlpha: number, frameMs: number) {
      syncSession(state);
      frame.onFrame(state, now, paused, frameMs);
      if (state.result !== "playing" && !lifecycle.terminalPresented) {
        lifecycle.terminalPresented = true;
        const yard = state.entities.find((entity) => entity.owner === 0 && entity.class === "building" && entity.kind === "constructionYard");
        lifecycle.counters.hqHealthAtEnd = yard ? yard.hp / Math.max(1, yard.maxHp) : 0;
        persistence.onTerminal(state, now, lifecycle.counters);
        ports.setState({ ...state, entities: [...state.entities] });
      }
      persistence.onTickFrame(state, now);
      ports.redraw(now, subTickAlpha);
    },
  };

  return controller;
}
