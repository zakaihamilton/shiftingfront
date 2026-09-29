"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useGameRuntime } from "./hooks/useGameRuntime";
import { createGameRuntimeSurfaceCache, createGameRuntimeSurfaces } from "./hooks/runtime/surfaces";
import { TacticalScreen } from "./TacticalScreen";
import { APP_NAME } from "@/lib/site";
import type { MultiplayerSession } from "@/lib/multiplayer/session";
import { registerGameplayAudioClient } from "@/lib/audio/mixer";

export function GameClient({
  seed,
  mission,
  resume,
  fresh = false,
  slot,
  tutorial = false,
  multiplayerSession,
}: {
  seed: number;
  mission: number;
  resume: boolean;
  fresh?: boolean;
  slot?: string;
  tutorial?: boolean;
  multiplayerSession?: MultiplayerSession;
}) {
  const runtime = useGameRuntime({ seed, mission, resume, fresh, slot, tutorial, multiplayerSession });
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
