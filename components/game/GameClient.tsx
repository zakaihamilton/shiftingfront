"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, useState } from "react";
import { useGameRuntime } from "./hooks/useGameRuntime";
import { createGameRuntimeSurfaceCache, createGameRuntimeSurfaces } from "./hooks/runtime/surfaces";
import { TacticalScreen } from "./TacticalScreen";
import type { SimState } from "@/lib/types";
import { getSaveRepository } from "@/lib/persist/save";
import { prepareInitialMission } from "./hooks/useGameSession";
import { PageFallback } from "@/components/ui/PageFallback";
import { APP_NAME } from "@/lib/site";
import type { MultiplayerSession } from "@/lib/multiplayer/session";
import { registerGameplayAudioClient } from "@/lib/audio/mixer";

function ReadyGameClient({
  seed,
  mission,
  resume,
  fresh = false,
  slot,
  tutorial = false,
  multiplayerSession,
  initialState,
}: {
  seed: number;
  mission: number;
  resume: boolean;
  fresh?: boolean;
  slot?: string;
  tutorial?: boolean;
  multiplayerSession?: MultiplayerSession;
  initialState?: import("@/lib/types").SimState;
}) {
  const runtime = useGameRuntime({ seed, mission, resume, fresh, slot, tutorial, multiplayerSession, initialState });
  const surfaceCache = useMemo(() => createGameRuntimeSurfaceCache(), []);
  const surfaces = createGameRuntimeSurfaces(runtime, surfaceCache);
  const subscribeToPing = useCallback(
    (listener: () => void) => multiplayerSession?.subscribePing(listener) ?? (() => undefined),
    [multiplayerSession],
  );
  const getPing = useCallback(() => multiplayerSession?.pingMs ?? null, [multiplayerSession]);
  const multiplayerPingMs = useSyncExternalStore(subscribeToPing, getPing, () => null);

  useEffect(() => registerGameplayAudioClient(), []);
  useEffect(() => multiplayerSession?.startLatencyProbes(), [multiplayerSession]);

  return (
    <TacticalScreen
      palette={runtime.palette}
      {...surfaces}
      title={APP_NAME}
      multiplayerPingMs={multiplayerSession?.hasPeerConnection ? multiplayerPingMs : undefined}
      multiplayerHost={multiplayerSession?.role === "host"}
    />
  );
}

export function GameClient(props: Parameters<typeof ReadyGameClient>[0]) {
  const { seed, mission, resume, fresh, slot, tutorial, multiplayerSession } = props;
  const repository = getSaveRepository();
  const [boot, setBoot] = useState<{ state?: SimState; error?: Error } | null>(null);
  const bootRequestRef = useRef<{ key: string; promise: Promise<SimState> } | null>(null);
  useEffect(() => {
    if (!repository || tutorial || multiplayerSession) return;
    let active = true;
    const key = JSON.stringify([seed, mission, resume, fresh, slot ?? null]);
    if (bootRequestRef.current?.key !== key) {
      bootRequestRef.current = {
        key,
        promise: prepareInitialMission({ seed, mission, resume, fresh, slot }),
      };
    }
    void bootRequestRef.current.promise.then((state) => { if (active) setBoot({ state }); },
      (error) => { if (active) setBoot({ error }); });
    return () => { active = false; };
  }, [repository, seed, mission, resume, fresh, slot, tutorial, multiplayerSession]);
  if (boot?.error) throw boot.error;
  if (repository && !props.tutorial && !props.multiplayerSession && !boot) return <PageFallback>Loading mission…</PageFallback>;
  return <ReadyGameClient {...props} initialState={boot?.state} />;
}
