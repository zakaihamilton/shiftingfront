"use client";

import { useSearchParams } from "next/navigation";
import { BriefingScreen } from "@/components/briefing/BriefingScreen";
import { RouteBoundary } from "@/components/ui/RouteBoundary";
import { parseMissionIndex, parseSeed } from "@/lib/seed/rng";
import { navigationOrigin } from "@/lib/navigation/routes";

function Inner() {
  const sp = useSearchParams();
  const seed = parseSeed(sp.get("seed") ?? "0000") ?? 0;
  const mission = parseMissionIndex(sp.get("mission")) ?? 0;
  const returnToGame = sp.get("return") === "game";
  const origin = navigationOrigin(sp.get("from"));
  return <BriefingScreen key={`${seed}:${mission}:${returnToGame}:${origin}`} seed={seed} mission={mission} returnToGame={returnToGame} origin={origin} />;
}

export default function BriefingPage() {
  return (
    <RouteBoundary loadingText="Loading briefing…" eyebrow="Signal lost" title="Briefing unavailable">
      <Inner />
    </RouteBoundary>
  );
}
