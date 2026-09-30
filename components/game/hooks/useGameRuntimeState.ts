import { useEffect, useMemo, useRef, useState } from "react";
import { createCampaign } from "@/lib/gen/campaign";
import { listMissionRasterSources } from "@/lib/gen/visualAssets";
import { generateVisualProfile } from "@/lib/gen/visualProfile";
import { cachedCampaignStorage, createSaveSession } from "@/lib/persist/save";
import type { Owner, SimState } from "@/lib/types";
import { preloadTerrainAtlas } from "@/lib/render/terrainAtlas";
import { preloadRasterSourcesAsync } from "@/lib/render/sprites";
import { initialMission } from "./useGameSession";
import { createSkirmish } from "@/lib/sim/api";

/** Owns the durable mission/session state and DOM refs used by runtime layers. */
export function useGameRuntimeState({
  seed,
  mission,
  resume,
  fresh,
  slot,
  tutorial,
  initialState,
  multiplayerOwner,
  multiplayerOwners,
  multiplayerAiOwners,
}: {
  seed: number;
  mission: number;
  resume: boolean;
  fresh: boolean;
  slot?: string;
  tutorial: boolean;
  initialState?: SimState;
  multiplayerOwner?: Owner;
  multiplayerOwners?: Owner[];
  multiplayerAiOwners?: Owner[];
}) {
  const campaign = useMemo(() => createCampaign(seed), [seed]);
  const playerVisualProfile = useMemo(() => generateVisualProfile(seed, multiplayerOwner ?? 0), [seed, multiplayerOwner]);
  const [boot] = useState(() => initialState ?? (multiplayerOwner === undefined
    ? initialMission(seed, mission, resume, tutorial, fresh, slot)
    : createSkirmish(seed, multiplayerOwner, multiplayerOwners, multiplayerAiOwners).state));
  const [state, setState] = useState<SimState>(boot);
  const saveSession = useMemo(() => createSaveSession(cachedCampaignStorage(), seed), [seed]);
  const stateRef = useRef<SimState>(state);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipCanvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const mobileMiniRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const sources = listMissionRasterSources(boot);
    void Promise.all([
      preloadTerrainAtlas(boot, { rowsPerChunk: 1 }),
      preloadRasterSourcesAsync(sources),
    ]).catch(() => undefined);
  }, [boot, mission, seed]);

  return {
    campaign,
    saveSession,
    playerVisualProfile,
    state,
    setState,
    stateRef,
    hostRef,
    canvasRef,
    tooltipCanvasRef,
    miniRef,
    mobileMiniRef,
  };
}
