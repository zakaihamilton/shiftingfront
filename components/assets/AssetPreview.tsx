import type { Ref } from "react";
import type { CatalogAsset } from "@/lib/gen/assetCatalog";
import type { Facing, FactionVisualProfile } from "@/lib/types";
import { AssetPreviewControls } from "./AssetPreviewControls";
import styles from "./AssetPreview.module.css";
import type { UnitPose } from "@/lib/render/anim";

export type AssetPreviewControlProps = {
  selected: CatalogAsset;
  facing: Facing;
  playing: boolean;
  construction: 0 | 1 | 2 | 3;
  damage: 0 | 1 | 2;
  designFamily: FactionVisualProfile["designFamily"];
  onFacing: (dir: Facing) => void;
  onPlaying: () => void;
  onConstruction: (stage: 0 | 1 | 2 | 3) => void;
  onDamage: (stage: 0 | 1 | 2) => void;
  onDesignFamily: (value: FactionVisualProfile["designFamily"]) => void;
  pose?: UnitPose;
  turretFacing?: Facing;
  onPose?: (pose: UnitPose) => void;
  onTurretFacing?: (dir: Facing) => void;
};

export type AssetPreviewProps = AssetPreviewControlProps & {
  canvasRef: Ref<HTMLCanvasElement>;
};

export function AssetPreview({ canvasRef, ...controls }: AssetPreviewProps) {
  return (
    <div className={styles.pane}>
      <div className={styles.stage}>
        <canvas ref={canvasRef} width={420} height={280} className={styles.canvas} aria-label={`${controls.selected.label} preview`} />
      </div>
      <AssetPreviewControls {...controls} />
    </div>
  );
}
