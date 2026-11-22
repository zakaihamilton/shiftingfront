"use client";

import dynamic from "next/dynamic";
import { type ReactNode, Suspense } from "react";
import { PageFallback } from "@/components/ui/PageFallback";

export const DynamicGameClient = dynamic(
  () => import("@/components/game/GameClient").then((m) => m.GameClient),
  { ssr: false, loading: () => <PageFallback>Loading campaign…</PageFallback> },
);

export function GamePageContainer({
  loadingText,
  children,
}: {
  loadingText: string;
  children: ReactNode;
}) {
  return <Suspense fallback={<PageFallback>{loadingText}</PageFallback>}>{children}</Suspense>;
}
