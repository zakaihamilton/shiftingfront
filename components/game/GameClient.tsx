"use client";

import { useMemo } from "react";
import { useGameRuntime } from "./hooks/useGameRuntime";
import { createGameRuntimeSurfaceCache, createGameRuntimeSurfaces } from "./hooks/runtime/surfaces";
import { TacticalScreen } from "./TacticalScreen";
import { APP_NAME } from "@/lib/site";

export function GameClient({
  seed,
  mission,
  resume,
  fresh = false,
  slot,
  tutorial = false,
}: {
  seed: number;
  mission: number;
  resume: boolean;
  fresh?: boolean;
  slot?: string;
  tutorial?: boolean;
}) {
  const runtime = useGameRuntime({ seed, mission, resume, fresh, slot, tutorial });
  const surfaceCache = useMemo(() => createGameRuntimeSurfaceCache(), []);
  const surfaces = createGameRuntimeSurfaces(runtime, surfaceCache);
  return (
    <TacticalScreen palette={runtime.palette} {...surfaces} title={APP_NAME} />
  );
}
