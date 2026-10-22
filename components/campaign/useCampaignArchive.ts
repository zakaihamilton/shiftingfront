import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  cachedCampaignStorage,
  exportSlot,
  getSaveRepository,
  importSlot,
  listArchiveEntries,
  listUnreadableSaves,
  listUnreadableSlots,
  removeSave,
  removeSlot,
  saveKey,
  slotKey,
  type ArchiveEntry,
} from "@/lib/persist/save";

export type ArchivePortabilityNotice = { tone: "success" | "alert"; text: string };

function safeExportName(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "slot";
}

export function useCampaignArchive() {
  const router = useRouter();
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [unreadableSaves, setUnreadableSaves] = useState<string[]>([]);
  const [unreadableSlots, setUnreadableSlots] = useState<string[]>([]);
  const [portabilityNotice, setPortabilityNotice] = useState<ArchivePortabilityNotice | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refreshSaves = useCallback(() => {
    const storage = cachedCampaignStorage();
    setEntries(listArchiveEntries(storage));
    setUnreadableSaves(listUnreadableSaves(storage));
    setUnreadableSlots(listUnreadableSlots(storage));
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(refreshSaves);
    return () => cancelAnimationFrame(frame);
  }, [refreshSaves]);

  useEffect(() => getSaveRepository()?.subscribe(refreshSaves), [refreshSaves]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      router.push("/");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const deleteEntry = useCallback(async (entry: ArchiveEntry) => {
    const storage = cachedCampaignStorage();
    if (getSaveRepository()) await getSaveRepository()!.remove(entry.kind === "slot" ? slotKey(entry.id) : saveKey(Number(entry.seed)));
    else if (entry.kind === "slot") removeSlot(storage, entry.id);
    else removeSave(storage, Number(entry.seed));
    refreshSaves();
  }, [refreshSaves]);

  const resetUnreadableSave = useCallback(async (seed: string) => {
    if (getSaveRepository()) await getSaveRepository()!.remove(saveKey(Number(seed)));
    else removeSave(cachedCampaignStorage(), Number(seed));
    refreshSaves();
  }, [refreshSaves]);

  const resetUnreadableSlot = useCallback(async (id: string) => {
    if (getSaveRepository()) await getSaveRepository()!.remove(slotKey(id));
    else removeSlot(cachedCampaignStorage(), id);
    refreshSaves();
  }, [refreshSaves]);

  const exportEntry = useCallback((entry: ArchiveEntry) => {
    if (entry.kind !== "slot") return;
    const raw = exportSlot(cachedCampaignStorage(), entry.id);
    if (!raw) {
      setPortabilityNotice({ tone: "alert", text: `Could not export ${entry.name}. The slot may be damaged.` });
      return;
    }
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shiftingfront-${entry.seed}-${safeExportName(entry.name)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setPortabilityNotice({ tone: "success", text: `Exported ${entry.name}.` });
  }, []);

  const importFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const raw = await file.text();
      const result = getSaveRepository() ? await getSaveRepository()!.importSlot(raw) : importSlot(cachedCampaignStorage(), raw);
      if (!result.ok) {
        setPortabilityNotice({
          tone: "alert",
          text: result.reason === "legacy-rules"
            ? "That save used the previous campaign rules. Its battle was retired and its campaign record was kept."
            : result.reason === "storage-failed"
              ? "Could not keep that campaign record because browser storage is unavailable. Free storage and try importing again."
              : "Could not import that file. It is invalid or unsupported.",
        });
        return;
      }
      setPortabilityNotice({ tone: "success", text: "Imported save as a new named slot." });
      refreshSaves();
    } catch {
      setPortabilityNotice({ tone: "alert", text: "Unable to read that save file." });
    }
  }, [refreshSaves]);

  const resumeEntry = useCallback((entry: ArchiveEntry) => {
    if (entry.kind === "slot") {
      router.push(`/play?seed=${entry.seed}&mission=${entry.missionIndex}&slot=${entry.id}`);
      return;
    }
    router.push(`/play?seed=${entry.seed}&resume=1&mission=${entry.missionIndex}`);
  }, [router]);

  const returnToMenu = useCallback(() => {
    router.push("/");
  }, [router]);

  const openCampaignMap = useCallback((seed: string) => {
    router.push(`/campaign?seed=${seed}`);
  }, [router]);

  return {
    entries,
    unreadableSaves,
    unreadableSlots,
    portabilityNotice,
    importInputRef,
    importFile,
    resumeEntry,
    exportEntry,
    deleteEntry,
    resetUnreadableSave,
    resetUnreadableSlot,
    returnToMenu,
    openCampaignMap,
  };
}
