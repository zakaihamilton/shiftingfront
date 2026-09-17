import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaign } from "@/lib/gen/campaign";
import { cachedLocalStorage } from "@/lib/persist/save";
import { defaultSettings, readSettings, type GameSettings } from "@/lib/persist/settings";
import { formatSeed, parseSeed } from "@/lib/seed/rng";
import { isEditableTarget, menuCommandFromKey } from "@/lib/ui/shortcuts";
import { useAudioPreferences } from "@/components/audio/useAudioPreferences";
import type { MenuView } from "./MenuOverlay";
import { tutorialPath } from "@/lib/navigation/routes";
import { menuLaunchPath, rollSeed, weeklySeed } from "./menuLaunch";

export function useMenuController() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<MenuView>("main");
  const [settings, setSettings] = useState<GameSettings>(() => defaultSettings());
  const inputRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef(0);
  const { toggleSound, toggleMusic, toggleReducedMotion, toggleHighContrast, cycleColorblind, updateKeyBindings, updateVolume } = useAudioPreferences(settings, setSettings);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const storage = cachedLocalStorage();
      setSettings(readSettings(storage));
      const parsed = parseSeed(new URLSearchParams(window.location.search).get("seed") ?? "");
      if (parsed === null) return;
      setCode(formatSeed(parsed));
      setView("newGame");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    // Warm client-side route chunks for seamless offline readiness
    router.prefetch?.("/tutorial");
    router.prefetch?.("/load");
    router.prefetch?.("/campaign");
    router.prefetch?.("/briefing");
    router.prefetch?.("/play");
  }, [router]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const preview = useMemo(() => {
    const seed = parseSeed(code);
    if (seed === null || code.length < 4) return null;
    return createCampaign(seed);
  }, [code]);

  const openNewGame = useCallback(() => {
    setCode((current) => current.length === 4 ? current : weeklySeed());
    setError("");
    setCopied(false);
    setView("newGame");
  }, []);

  const openOptions = useCallback(() => setView("options"), []);
  const openCredits = useCallback(() => setView("credits"), []);
  const openLoadMission = useCallback(() => router.push("/load"), [router]);
  const openTutorial = useCallback(() => router.push(tutorialPath()), [router]);

  const randomize = useCallback(() => {
    setCode(rollSeed());
    setError("");
    setCopied(false);
  }, []);

  const restoreWeekly = useCallback(() => {
    setCode(weeklySeed());
    setError("");
    setCopied(false);
  }, []);

  const copyLink = useCallback(() => {
    const seed = parseSeed(code);
    if (seed === null || code.length < 4) return;
    const url = `${window.location.origin}/?seed=${formatSeed(seed)}`;
    if (!navigator.clipboard?.writeText) {
      setError("Could not copy the campaign link.");
      return;
    }
    return navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      setError("Could not copy the campaign link.");
    });
  }, [code]);

  const launch = useCallback(() => {
    const path = menuLaunchPath(code, view === "newGame" ? "newGame" : "menu");
    if (!path) {
      setError("Enter a 4-digit campaign code (0000–9999), or roll a random campaign.");
      return;
    }
    setError("");
    router.push(path);
  }, [code, router, view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const command = menuCommandFromKey(e, {
        typing: isEditableTarget(e.target),
        setupOpen: view === "newGame",
        optionsOpen: view === "options",
      });
      if (!command) return;
      e.preventDefault();
      if (command.type === "newGame") openNewGame();
      else if (command.type === "tutorial") openTutorial();
      else if (command.type === "loadMission") openLoadMission();
      else if (command.type === "options") openOptions();
      else if (command.type === "toggleSound") toggleSound();
      else if (command.type === "toggleMusic") toggleMusic();
      else if (command.type === "deploy") launch();
      else if (command.type === "randomize") randomize();
      else if (command.type === "back") setView("main");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, openNewGame, openTutorial, openLoadMission, openOptions, toggleSound, toggleMusic, launch, randomize]);

  return {
    code,
    error,
    copied,
    view,
    settings,
    inputRef,
    preview,
    previewLine: preview
      ? `${preview.world.name} · ${preview.factions[0].name} vs ${preview.factions[1].name}`
      : "Enter a 4-digit campaign code — or roll a random campaign",
    openNewGame,
    openTutorial,
    openLoadMission,
    openOptions,
    openCredits,
    randomize,
    restoreWeekly,
    copyLink,
    launch,
    toggleSound,
    toggleMusic,
    toggleReducedMotion,
    toggleHighContrast,
    cycleColorblind,
    updateKeyBindings,
    updateVolume,
    setCode: (value: string) => {
      setCode(value);
      setError("");
      setCopied(false);
    },
    goBack: () => {
      setCopied(false);
      setView("main");
    },
  };
}
