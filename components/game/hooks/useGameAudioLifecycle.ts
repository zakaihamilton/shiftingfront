import { useEffect } from "react";
import { pauseMusic, setMusicCue, setMusicDucked } from "@/lib/audio/music";
import type { SimState } from "@/lib/types";

export function useGameAudioLifecycle({ seed, missionIndex, tutorial, paused, result }: { seed: number; missionIndex: number; tutorial: boolean; paused: boolean; result: SimState["result"] }) {
  useEffect(() => {
    if (paused || tutorial || result !== "playing") {
      pauseMusic();
      return;
    }
    setMusicDucked(false);
    setMusicCue("mission", seed, missionIndex);
  }, [missionIndex, paused, result, seed, tutorial]);

  useEffect(() => () => {
    setMusicDucked(false);
  }, []);
}
