import { dispatchBattlefieldAudio } from "@/lib/audio/battlefield";
import { pauseMusic, setMusicIntensity, type MusicIntensity } from "@/lib/audio/music";
import { playSfx } from "@/lib/audio/synth";
import { playVoiceBark } from "@/lib/audio/voice";
import { burstsFromEvents, type FxBurst } from "@/lib/render/fx";
import { addScreenShake, type ScreenShakeState } from "@/lib/render/screenShake";
import type { Camera } from "@/lib/iso";
import type { SimEvent, SimState } from "@/lib/types";
import { isUnitKind } from "@/lib/catalog";
import { commandRejectionMessage } from "@/lib/ui/copy";
import { alertSfx, desiredMusicIntensity, firstAlert, rejectionSfx } from "../gameLoopEffects";

export function createPresentationCoordinator({
  cameraRef,
  canvasRef,
  fxRef,
  fxSequence,
  screenShakeRef,
  onAlert,
  onCommandNotice,
}: {
  cameraRef: { current: Camera };
  canvasRef: { current: HTMLCanvasElement | null };
  fxRef: { current: FxBurst[] };
  fxSequence: { current: number };
  screenShakeRef?: { current: ScreenShakeState };
  onAlert: (text: string, kind?: "warning" | "objective" | "contact" | "system") => void;
  onCommandNotice: (text: string, kind?: "success" | "info" | "warning" | "error") => void;
}) {
  let appliedIntensity: MusicIntensity = "calm";
  let lastCombatTick = Number.NEGATIVE_INFINITY;

  return {
    reset() {
      appliedIntensity = "calm";
      lastCombatTick = Number.NEGATIVE_INFINITY;
    },
    onTick(state: SimState, events: SimEvent[], now: number) {
      if (events.some((event) => event.type === "combat")) lastCombatTick = state.tick;
      const terminal = events.some((event) => event.type === "won" || event.type === "lost");
      if (terminal) pauseMusic();
      const alert = firstAlert(events);
      const intensity = desiredMusicIntensity(
        state.runtime?.director?.phase,
        state.tick,
        lastCombatTick,
        alert?.kind === "warning",
      );
      if (!terminal && intensity !== appliedIntensity) {
        appliedIntensity = intensity;
        setMusicIntensity(intensity);
      }
      dispatchBattlefieldAudio(
        events,
        cameraRef.current,
        canvasRef.current?.width ?? 1,
        canvasRef.current?.height ?? 1,
      );
      if (events.some((event) => event.type === "won")) playSfx("victory", { force: true });
      if (events.some((event) => event.type === "lost")) playSfx("defeat", { force: true });

      const rejection = events.find((event) => event.type === "commandRejected");
      if (rejection?.type === "commandRejected") {
        playSfx(rejectionSfx(rejection.reason));
        const message = commandRejectionMessage(rejection.reason);
        onCommandNotice(message, "error");
      }
      if (alert) {
        playSfx(alertSfx(alert.kind), { force: true });
        onAlert(alert.text, alert.kind);
        if (alert.kind === "warning") {
          playVoiceBark("threat");
        }
      }
      if (screenShakeRef) {
        for (const event of events) {
          if (event.type === "destroyed" && !isUnitKind(event.kind)) {
            addScreenShake(screenShakeRef.current, 0.7);
          }
        }
      }
      if (events.some((event) => ["combat", "destroyed", "support", "built", "produced"].includes(event.type))) {
        const spawned = burstsFromEvents(events, state, now, fxSequence.current);
        fxSequence.current = spawned.nextId;
        fxRef.current.push(...spawned.bursts);
      }
    },
  };
}
