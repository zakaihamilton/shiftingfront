import { useEffect, useMemo, useRef, useState } from "react";
import { filterGeneratedAssets, listGeneratedAssets, type AssetCategoryFilter } from "@/lib/gen/assetCatalog";
import { generateVisualProfile } from "@/lib/gen/visualProfile";
import { assetsCommandFromKey, isEditableTarget } from "@/lib/ui/shortcuts";
import type { Facing, FactionVisualProfile } from "@/lib/types";
import type { UnitPose } from "@/lib/render/anim";

export function useAssetsBrowser(onClose: () => void) {
  const assets = useMemo(() => listGeneratedAssets(), []);
  const [selectedId, setSelectedId] = useState(assets[0]?.id ?? "");
  const [assetFilter, setAssetFilterState] = useState<AssetCategoryFilter>("all");
  const selected = assets.find((asset) => asset.id === selectedId) ?? assets[0];
  const visibleAssets = useMemo(() => filterGeneratedAssets(assets, assetFilter), [assets, assetFilter]);
  const [facing, setFacing] = useState<Facing>(0);
  const [playing, setPlaying] = useState(true);
  const [pose, setPose] = useState<UnitPose>("idle");
  const [turretFacing, setTurretFacing] = useState<Facing>(0);
  const [construction, setConstruction] = useState<0 | 1 | 2 | 3>(3);
  const [damage, setDamage] = useState<0 | 1 | 2>(0);
  const [designFamily, setDesignFamily] = useState<FactionVisualProfile["designFamily"]>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const profile = useMemo(() => ({ ...generateVisualProfile(421, 0), designFamily }), [designFamily]);

  const selectAsset = (id: string) => {
    setSelectedId(id);
    setFacing(0);
    setPose("idle");
    setTurretFacing(0);
    setConstruction(3);
    setDamage(0);
    setPlaying(true);
  };

  const setAssetFilter = (nextFilter: AssetCategoryFilter) => {
    setAssetFilterState(nextFilter);
    const nextAssets = filterGeneratedAssets(assets, nextFilter);
    if (nextAssets.some((asset) => asset.id === selectedId)) return;
    const nextAsset = nextAssets[0];
    if (nextAsset) selectAsset(nextAsset.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const command = assetsCommandFromKey(e, { typing: isEditableTarget(e.target) });
      if (!command) return;
      e.preventDefault();
      if (command.type === "close") {
        onClose();
        return;
      }
      if (command.type === "togglePlay") {
        setPlaying((value) => !value);
        return;
      }
      const index = visibleAssets.findIndex((asset) => asset.id === selectedId);
      const from = index < 0 ? 0 : index;
      const next = from + (command.type === "nextAsset" ? 1 : -1);
      const nextId = visibleAssets[Math.min(visibleAssets.length - 1, Math.max(0, next))]?.id;
      if (!nextId || nextId === selectedId) return;
      setSelectedId(nextId);
      setFacing(0);
      setPose("idle");
      setTurretFacing(0);
      setConstruction(3);
      setDamage(0);
      setPlaying(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assets, onClose, selectedId, visibleAssets]);

  return {
    assets,
    selected,
    assetFilter,
    facing,
    playing,
    pose,
    turretFacing,
    construction,
    damage,
    designFamily,
    canvasRef,
    profile,
    selectAsset,
    setAssetFilter,
    setFacing,
    setPlaying,
    setPose,
    setTurretFacing,
    setConstruction,
    setDamage,
    setDesignFamily,
  };
}
