"use client";

import { useSyncExternalStore } from "react";
import { campaignKey, freshCampaignProgress, readCampaignProgress } from "@/lib/persist/campaign";
import { cachedLocalStorage, safeGetItem } from "@/lib/persist/save";
import type { CampaignProgress } from "@/lib/types";

const snapshots = new Map<number, { raw: string | null; progress: CampaignProgress }>();
const serverSnapshots = new Map<number, CampaignProgress>();

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function clientSnapshot(seed: number): CampaignProgress {
  const storage = cachedLocalStorage();
  const raw = safeGetItem(storage, campaignKey(seed));
  const cached = snapshots.get(seed);
  if (cached?.raw === raw) return cached.progress;
  const progress = readCampaignProgress(storage, seed);
  snapshots.set(seed, { raw, progress });
  return progress;
}

function serverSnapshot(seed: number): CampaignProgress {
  const cached = serverSnapshots.get(seed);
  if (cached) return cached;
  const progress = freshCampaignProgress(seed);
  serverSnapshots.set(seed, progress);
  return progress;
}

export function useCampaignProgress(seed: number): CampaignProgress {
  return useSyncExternalStore(subscribe, () => clientSnapshot(seed), () => serverSnapshot(seed));
}
