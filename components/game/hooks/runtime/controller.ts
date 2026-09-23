import { startLoop, type LoopHandle } from "@/lib/game/loop";
import { TICKS_PER_SECOND } from "@/lib/catalog";
import { createScenarioRunner } from "@/lib/sim/scenarioRunner";
import { entitiesFor } from "@/lib/sim/entities";
import type { SimEvent, SimState } from "@/lib/types";
import { canonicalCommandRejectionReason, type MissionUxTelemetry } from "@/lib/persist/telemetry";
import { createFrameCoordinator } from "./frame";
import { createPersistenceCoordinator } from "./persistence";
import { createPresentationCoordinator } from "./presentation";
import type { RuntimeController, RuntimeKernel } from "./types";

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

export function createRuntimeController(kernel: RuntimeKernel): RuntimeController {
  const { simulation: simRefs, interaction: interactionRefs, rendering: renderRefs } = kernel.refs;
  const {
    simulation: simPorts,
    frame: framePorts,
    presentation: presentationPorts,
    persistence: persistencePorts,
  } = kernel.ports;
  let loop: LoopHandle | null = null;
  let started = false;
  const lifecycle = simRefs.lifecycleRef.current;
  let scenarioRunner = createScenarioRunner(simRefs.stateRef.current);

  const persistence = createPersistenceCoordinator({
    stateRef: simRefs.stateRef,
    terminalSaveRef: simRefs.terminalSaveRef,
    campaignRecordedRef: simRefs.campaignRecordedRef,
    saveSession: persistencePorts.saveSession,
    persistCampaign: persistencePorts.persistCampaign,
    onAlert: presentationPorts.onAlert,
    persistenceRef: simRefs.persistenceRef,
    suppressImplicitSavesRef: simRefs.suppressImplicitSavesRef,
  });
  const presentation = createPresentationCoordinator({
    cameraRef: interactionRefs.cameraRef,
    canvasRef: renderRefs.canvasRef,
    fxRef: renderRefs.fxRef,
    fxSequence: renderRefs.fxSequence,
    screenShakeRef: renderRefs.screenShakeRef,
    onAlert: presentationPorts.onAlert,
    onCommandNotice: presentationPorts.onCommandNotice,
  });
  const frame = createFrameCoordinator({
    cameraRef: interactionRefs.cameraRef,
    canvasRef: renderRefs.canvasRef,
    keys: interactionRefs.keys,
    edgePanHover: interactionRefs.edgePanHover,
    panHold: interactionRefs.panHold,
    panAvailabilityRef: interactionRefs.panAvailabilityRef,
    setPanAvailability: framePorts.setPanAvailability,
    applyEdgePan: framePorts.applyEdgePan,
  });

  const syncSession = (state: SimState) => {
    if (lifecycle.sessionState === state) return;
    const isInitialSession = lifecycle.sessionState === null;
    lifecycle.sessionState = state;
    lifecycle.terminalPresented = simRefs.terminalSaveRef.current;
    lifecycle.commandApplied = false;
    lifecycle.counters.commandsIssued = 0;
    lifecycle.counters.commandRejections = 0;
    const briefingSkipped = isInitialSession && simRefs.uxRef.current.briefingSkipped;
    lifecycle.counters.ux = simRefs.uxRef.current = {
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
      syncSession(simRefs.stateRef.current);
      persistence.start();
      loop = startLoop({
        getState: () => simRefs.stateRef.current,
        setState: (state) => {
          simRefs.stateRef.current = state;
        },
        drainCommands: controller.drainCommands,
        step: (state, commands) => {
          if (scenarioRunner.state !== state) scenarioRunner = createScenarioRunner(state);
          return scenarioRunner.step(commands);
        },
        isPaused: () => simRefs.pausedRef.current,
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
      syncSession(simRefs.stateRef.current);
      const commands = simRefs.commandQueue.current.splice(0, simRefs.commandQueue.current.length);
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
        const yard = entitiesFor(state).find((entity) => entity.owner === 0 && entity.class === "building" && entity.kind === "constructionYard");
        if (yard) lifecycle.counters.hqHealthAtPressure = yard.hp / Math.max(1, yard.maxHp);
      }
      if (lifecycle.counters.firstHqThreatTick === undefined) {
        const entities = entitiesFor(state);
        const yard = entities.find((entity) => entity.owner === 0 && entity.class === "building" && entity.kind === "constructionYard");
        if (yard && entities.some((entity) => entity.owner === 1 && entity.attackTarget === yard.id)) {
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
        simPorts.setState({ ...state, entities: [...state.entities] });
      }
      presentation.onTick(state, events, now);
    },
    onFrame(now: number, state: SimState, paused: boolean, subTickAlpha: number, frameMs: number) {
      syncSession(state);
      frame.onFrame(state, now, paused, frameMs);
      if (state.result !== "playing" && !lifecycle.terminalPresented) {
        lifecycle.terminalPresented = true;
        const yard = entitiesFor(state).find((entity) => entity.owner === 0 && entity.class === "building" && entity.kind === "constructionYard");
        lifecycle.counters.hqHealthAtEnd = yard ? yard.hp / Math.max(1, yard.maxHp) : 0;
        persistence.onTerminal(state, now, lifecycle.counters);
        simPorts.setState({ ...state, entities: [...state.entities] });
      }
      persistence.onTickFrame(state, now);
      framePorts.redraw(now, subTickAlpha);
    },
  };

  return controller;
}
