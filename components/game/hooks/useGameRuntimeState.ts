import { useEffect, useMemo, useRef, useState } from "react";
import { createCampaign } from "@/lib/gen/campaign";
import { listMissionRasterSources } from "@/lib/gen/visualAssets";
import { generateVisualProfile } from "@/lib/gen/visualProfile";
import { cachedLocalStorage, createSaveSession } from "@/lib/persist/save";
import type { SimState } from "@/lib/types";
import { preloadTerrainAtlas } from "@/lib/render/terrainAtlas";
import { preloadRasterSources } from "@/lib/render/sprites";
import { initialMission } from "./useGameSession";

/** Owns the durable mission/session state and DOM refs used by runtime layers. */
export function useGameRuntimeState({
  seed,
  mission,
  resume,
  fresh,
  slot,
  tutorial,
}: {
  seed: number;
  mission: number;
  resume: boolean;
  fresh: boolean;
  slot?: string;
  tutorial: boolean;
}) {
  const campaign = useMemo(() => createCampaign(seed), [seed]);
  const playerVisualProfile = useMemo(() => generateVisualProfile(seed, 0), [seed]);
  const [state, setState] = useState<SimState>(() => initialMission(seed, mission, resume, tutorial, fresh, slot));
  const saveSession = useMemo(() => createSaveSession(cachedLocalStorage(), seed), [seed]);
  const stateRef = useRef<SimState>(state);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const mobileMiniRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const currentState = stateRef.current;
    void preloadTerrainAtlas(currentState);
    preloadRasterSources(listMissionRasterSources(currentState));
  }, [mission, seed, stateRef]);

  return {
    campaign,
    saveSession,
    playerVisualProfile,
    state,
    setState,
    stateRef,
    hostRef,
    canvasRef,
    miniRef,
    mobileMiniRef,
  };
}
