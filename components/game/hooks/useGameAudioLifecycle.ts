import { useEffect } from "react";
import { TUTORIAL_MUSIC_MISSION, pauseMusic, setMusicCue, setMusicDucked } from "@/lib/audio/music";
import { cancelVoiceSpeech } from "@/lib/audio/voice";
import type { SimState } from "@/lib/types";

export function useGameAudioLifecycle({ seed, missionIndex, tutorial, paused, result }: { seed: number; missionIndex: number; tutorial: boolean; paused: boolean; result: SimState["result"] }) {
  useEffect(() => {
    if (paused) {
      pauseMusic();
      return;
    }
    setMusicDucked(false);
    if (tutorial) {
      setMusicCue("mission", seed, TUTORIAL_MUSIC_MISSION);
      return;
    }
    if (result === "won") {
      setMusicCue("victory", seed, missionIndex);
      return;
    }
    if (result === "lost") {
      setMusicCue("defeat", seed, missionIndex);
      return;
    }
    if (result !== "playing") {
      pauseMusic();
      return;
    }
    setMusicCue("mission", seed, missionIndex);
  }, [missionIndex, paused, result, seed, tutorial]);

  useEffect(() => () => {
    setMusicDucked(false);
    pauseMusic();
    cancelVoiceSpeech();
  }, []);
}
