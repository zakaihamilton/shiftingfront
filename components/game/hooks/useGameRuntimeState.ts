import { useEffect, useMemo, useRef, useState } from "react";
import { createCampaign } from "@/lib/gen/campaign";
import { listMissionRasterSources, MOBILE_HQ_DIRECTION_ART, SPRITE_ART } from "@/lib/gen/visualAssets";
import { generateVisualProfile } from "@/lib/gen/visualProfile";
import { cachedLocalStorage, createSaveSession } from "@/lib/persist/save";
import type { Owner, SimState } from "@/lib/types";
import { preloadTerrainAtlas } from "@/lib/render/terrainAtlas";
import { preloadRasterSourcesAsync } from "@/lib/render/sprites";
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
  const [battlefieldReady, setBattlefieldReady] = useState(!boot.intro);
  const saveSession = useMemo(() => createSaveSession(cachedLocalStorage(), seed), [seed]);
  const stateRef = useRef<SimState>(state);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipCanvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const mobileMiniRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const currentState = boot.state;
    const sources = listMissionRasterSources(currentState);
    if (boot.intro) {
      sources.push(
        ...Object.values(MOBILE_HQ_DIRECTION_ART),
        SPRITE_ART.constructionYard,
      );
    }
    const preload = Promise.all([
      preloadTerrainAtlas(currentState),
      preloadRasterSourcesAsync(sources),
    ]);
    if (boot.intro) {
      void preload.then(() => {
        if (!cancelled) setBattlefieldReady(true);
      }).catch(() => {
        if (!cancelled) setBattlefieldReady(true);
      });
    } else {
      void preload.catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [boot, mission, seed]);

  return {
    campaign,
    saveSession,
    playerVisualProfile,
    initialIntro: boot.intro,
    battlefieldReady,
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
