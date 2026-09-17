import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearMusicPosition } from "@/lib/audio/music";
import { clearBriefingSkippedIntent, markBriefingSkippedIntent, markFreshLaunchIntent } from "@/lib/persist/navigation";
import { formatSeed } from "@/lib/seed/rng";
import { briefingCommandFromKey, isEditableTarget } from "@/lib/ui/shortcuts";
import { briefingBackPath, type NavigationOrigin } from "@/lib/navigation/routes";

export function useBriefingController({
  seed,
  mission,
  returnToGame,
  origin = "menu",
  isComplete,
  replayTransmission,
  skipToEnd,
}: {
  seed: number;
  mission: number;
  returnToGame: boolean;
  origin?: NavigationOrigin;
  isComplete: boolean;
  replayTransmission: () => void;
  skipToEnd: () => void;
}) {
  const router = useRouter();

  const launch = useCallback(() => {
    if (!returnToGame) {
      markFreshLaunchIntent(seed, mission);
      clearMusicPosition("mission", seed, mission);
    }
    router.push(`/play?seed=${formatSeed(seed)}&mission=${mission}${returnToGame ? "&resume=1" : "&fresh=1"}`);
  }, [mission, returnToGame, router, seed]);

  const back = useCallback(() => {
    clearBriefingSkippedIntent(seed, mission);
    router.push(briefingBackPath(seed, mission, returnToGame, origin));
  }, [mission, origin, returnToGame, router, seed]);

  const skip = useCallback(() => {
    markBriefingSkippedIntent(seed, mission);
    skipToEnd();
  }, [mission, seed, skipToEnd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const command = briefingCommandFromKey(e, {
        typing: isEditableTarget(e.target),
        revealed: isComplete,
        returnToGame,
      });
      if (!command) return;
      e.preventDefault();
      if (command.type === "skip") {
        skip();
        return;
      }
      if (command.type === "replay") {
        replayTransmission();
        return;
      }
      if (command.type === "back") {
        back();
        return;
      }
      launch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, isComplete, launch, replayTransmission, returnToGame, skip]);

  return {
    launch,
    back,
    skip,
  };
}
