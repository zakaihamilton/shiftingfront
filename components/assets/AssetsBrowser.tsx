"use client";

import { MetalPanel } from "@/components/ui/MetalPanel";
import type { Palette } from "@/lib/types";
import { AssetList } from "./AssetList";
import { AssetPreview } from "./AssetPreview";
import { AssetsBayHeader } from "./AssetsBayHeader";
import { useAssetBayPreview } from "./useAssetBayPreview";
import { useAssetsBrowser } from "./useAssetsBrowser";
import styles from "./AssetsBrowser.module.css";

export function AssetsBrowser({
  palette,
  onClose,
}: {
  palette: Palette;
  onClose: () => void;
}) {
  const {
    assets,
    selected,
    facing,
    playing,
    pose,
    turretFacing,
    construction,
    damage,
    designFamily,
    assetFilter,
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
  } = useAssetsBrowser(onClose);

  useAssetBayPreview({
    canvasRef,
    selected,
    palette,
    profile,
    facing,
    playing,
    pose,
    turretFacing,
    construction,
    damage,
  });

  if (!selected) return null;

  return (
    <MetalPanel className={styles.browser} data-testid="assets-browser" role="dialog" aria-labelledby="assets-title">
      <AssetsBayHeader onClose={onClose} />

      <div className={styles.body}>
        <AssetList
          assets={assets}
          selectedId={selected.id}
          onSelect={selectAsset}
          filter={assetFilter}
          onFilterChange={setAssetFilter}
        />
        <AssetPreview
          selected={selected}
          canvasRef={canvasRef}
          facing={facing}
          playing={playing}
          pose={pose}
          turretFacing={turretFacing}
          onPose={setPose}
          onTurretFacing={setTurretFacing}
          construction={construction}
          damage={damage}
          designFamily={designFamily}
          onFacing={setFacing}
          onPlaying={() => setPlaying((value) => !value)}
          onConstruction={setConstruction}
          onDamage={setDamage}
          onDesignFamily={setDesignFamily}
        />
      </div>
    </MetalPanel>
  );
}
