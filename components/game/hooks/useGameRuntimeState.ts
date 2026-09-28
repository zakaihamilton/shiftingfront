import { useEffect, useMemo, useRef, useState } from "react";
import { createCampaign } from "@/lib/gen/campaign";
import { listMissionRasterSources } from "@/lib/gen/visualAssets";
import { generateVisualProfile } from "@/lib/gen/visualProfile";
import { cachedLocalStorage, createSaveSession } from "@/lib/persist/save";
import type { Owner, SimState } from "@/lib/types";
import { preloadTerrainAtlas } from "@/lib/render/terrainAtlas";
import { preloadRasterSources } from "@/lib/render/sprites";
import { initialMissionBoot } from "./useGameSession";
import { createSkirmish } from "@/lib/sim/api";

/** Owns the durable mission/session state and DOM refs used by runtime layers. */
export function useGameRuntimeState({
  seed,
  mission,
  resume,
  fresh,
  slot,
  tutorial,
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
  multiplayerOwner?: Owner;
  multiplayerOwners?: Owner[];
  multiplayerAiOwners?: Owner[];
}) {
  const campaign = useMemo(() => createCampaign(seed), [seed]);
  const playerVisualProfile = useMemo(() => generateVisualProfile(seed, multiplayerOwner ?? 0), [seed, multiplayerOwner]);
  const [boot] = useState(() => multiplayerOwner === undefined
    ? initialMissionBoot(seed, mission, resume, tutorial, fresh, slot)
    : { state: createSkirmish(seed, multiplayerOwner, multiplayerOwners, multiplayerAiOwners).state, intro: true });
  const [state, setState] = useState<SimState>(boot.state);
  const saveSession = useMemo(() => createSaveSession(cachedLocalStorage(), seed), [seed]);
  const stateRef = useRef<SimState>(state);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipCanvasRef = useRef<HTMLCanvasElement>(null);
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
    initialIntro: boot.intro,
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
