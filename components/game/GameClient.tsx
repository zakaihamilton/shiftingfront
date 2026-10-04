"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, useState } from "react";
import { useGameRuntime } from "./hooks/useGameRuntime";
import { createGameRuntimeSurfaceCache, createGameRuntimeSurfaces } from "./hooks/runtime/surfaces";
import { TacticalScreen } from "./TacticalScreen";
import type { SimState } from "@/lib/types";
import { getSaveRepository } from "@/lib/persist/save";
import { initialMission, prepareInitialMission } from "./hooks/useGameSession";
import { PageFallback } from "@/components/ui/PageFallback";
import { APP_NAME } from "@/lib/site";
import type { MultiplayerSession } from "@/lib/multiplayer/session";
import { registerGameplayAudioClient } from "@/lib/audio/mixer";
import { createSkirmish } from "@/lib/sim/api";
import { listMissionRasterSources } from "@/lib/gen/visualAssets";
import { preloadRasterSourcesAsync } from "@/lib/render/sprites";
import { preloadTerrainAtlas } from "@/lib/render/terrainAtlas";
import { acquireRenderSessionCacheLease } from "@/lib/render/sessionCache";

async function preloadTerrainAtlasForBoot(state: SimState): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (await preloadTerrainAtlas(state, { rowsPerChunk: 1 })) return;
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")) throw error;
    }
  }
  throw new Error("Terrain atlas preparation was repeatedly invalidated.");
}

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
  const [boot, setBoot] = useState<{ state: SimState; error?: never } | { error: Error; state?: never } | null>(null);
  const bootRequestRef = useRef<{
    key: string;
    initialState?: SimState;
    multiplayerSession?: MultiplayerSession;
    promise: Promise<SimState>;
  } | null>(null);
  useEffect(() => acquireRenderSessionCacheLease(), []);
  useEffect(() => {
    let active = true;
    const key = JSON.stringify([seed, mission, resume, fresh, slot ?? null, tutorial, Boolean(multiplayerSession)]);
    const cachedRequest = bootRequestRef.current;
    const needsPreparation = !cachedRequest
      || cachedRequest.key !== key
      || cachedRequest.initialState !== props.initialState
      || cachedRequest.multiplayerSession !== multiplayerSession;
    if (needsPreparation) {
      const statePromise = (async () => {
        if (props.initialState) return props.initialState;
        if (repository && !tutorial && !multiplayerSession) {
          return prepareInitialMission({ seed, mission, resume, fresh, slot });
        }
        if (multiplayerSession) {
          return createSkirmish(
            seed,
            multiplayerSession.owner,
            multiplayerSession.owners,
            multiplayerSession.aiOwners,
          ).state;
        }
        return initialMission(seed, mission, resume, Boolean(tutorial), fresh, slot);
      })();
      bootRequestRef.current = {
        key,
        initialState: props.initialState,
        multiplayerSession,
        promise: statePromise.then(async (state) => {
          await Promise.all([
            preloadTerrainAtlasForBoot(state),
            preloadRasterSourcesAsync(listMissionRasterSources(state)),
          ]);
          return state;
        }),
      };
    }
    void bootRequestRef.current!.promise.then((state) => { if (active) setBoot({ state }); },
      (error) => { if (active) setBoot({ error }); });
    return () => { active = false; };
  }, [repository, seed, mission, resume, fresh, slot, tutorial, multiplayerSession, props.initialState]);
  if (boot?.error) throw boot.error;
  if (!boot) return <PageFallback>Preparing battlefield…</PageFallback>;
  return <ReadyGameClient {...props} initialState={boot.state} />;
}
