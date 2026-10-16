import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import type { Facing } from "@/lib/types";
import { AssetChip } from "./AssetChip";
import type { AssetPreviewControlProps } from "./AssetPreview";
import styles from "./AssetPreview.module.css";

const FACINGS: Facing[] = [0, 1, 2, 3, 4, 5, 6, 7];
const FACING_LABELS = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
const CONSTRUCTION = [0, 1, 2, 3] as const;
const DAMAGE = [0, 1, 2] as const;

export function AssetPreviewControls({
  selected,
  facing,
  playing,
  construction,
  damage,
  designFamily,
  onFacing,
  onPlaying,
  onConstruction,
  onDamage,
  onDesignFamily,
  pose = "idle",
  turretFacing = 0,
  onPose,
  onTurretFacing,
}: AssetPreviewControlProps) {
  const showFacing = selected.category === "unit" || (selected.category === "building" && selected.kind === "turret");
  const showAnim = selected.category === "unit" || selected.category === "building";

  return (
    <div className={styles.controls}>
      <p className={styles.meta}>
        {selected.label}
        {showFacing ? ` · facing ${FACING_LABELS[facing]}` : ""}
        {showAnim && playing ? " · animating" : ""}
      </p>

      {showFacing ? (
        <div className={styles.group}>
          <ConsoleLabel>Facing</ConsoleLabel>
          <div className={styles.compass}>
            {FACINGS.map((dir) => (
              <AssetChip
                key={dir}
                active={facing === dir}
                tooltip={`Face ${FACING_LABELS[dir]}`}
                onClick={() => onFacing(dir)}
              >
                {FACING_LABELS[dir]}
              </AssetChip>
            ))}
          </div>
        </div>
      ) : null}

      {showAnim ? (
        <ConsoleButton
          className={styles.play}
          tooltip={playing ? "Pause animation" : "Play animation"}
          shortcut={SHORTCUT.play}
          onClick={onPlaying}
        >
          {playing ? "Pause animation" : "Play animation"}
        </ConsoleButton>
      ) : null}
      {selected.category === "unit" && onPose ? (
        <div className={styles.group}>
          <ConsoleLabel>Action</ConsoleLabel>
          <div className={styles.chips}>
            {(["idle", "move", "attack", "work"] as const).filter(action => (action !== "work" || ["medic", "repairTruck", "harvester"].includes(selected.kind)) && (action !== "attack" || ["infantry", "antiArmor", "tank", "behemoth", "strikePlane"].includes(selected.kind))).map(action => (
              <AssetChip key={action} active={pose === action} tooltip={`Preview ${action}`} onClick={() => onPose(action)}>
                {{ idle: "Idle", move: "Moving", attack: "Firing", work: "Working" }[action]}
              </AssetChip>
            ))}
          </div>
        </div>
      ) : null}
      {selected.category === "unit" && ["tank", "behemoth"].includes(selected.kind) && onTurretFacing ? (
        <div className={styles.group}>
          <ConsoleLabel>Turret aim</ConsoleLabel>
          <div className={styles.compass}>{FACINGS.map(dir => (
            <AssetChip key={dir} active={turretFacing === dir} tooltip={`Aim ${FACING_LABELS[dir]}`} onClick={() => onTurretFacing(dir)}>{FACING_LABELS[dir]}</AssetChip>
          ))}</div>
        </div>
      ) : null}

      {selected.category === "unit" || selected.category === "building" ? (
        <div className={styles.group}>
          <ConsoleLabel>Faction design</ConsoleLabel>
          <div className={styles.chips}>
            {([0, 1, 2] as const).map((family) => (
              <AssetChip
                key={family}
                active={designFamily === family}
                tooltip={["Angular vanguard", "Heavy fortress", "Industrial utility"][family]!}
                onClick={() => onDesignFamily(family)}
              >
                {`Family ${family + 1}`}
              </AssetChip>
            ))}
          </div>
        </div>
      ) : null}

      {selected.category === "building" ? (
        <>
          <ConsoleLabel className={styles.group}>Construction</ConsoleLabel>
          <div className={styles.chips}>
            {CONSTRUCTION.map((stage) => (
              <AssetChip
                key={stage}
                active={construction === stage}
                tooltip={`Construction stage ${stage}`}
                onClick={() => onConstruction(stage)}
              >
                {`Stage ${stage}`}
              </AssetChip>
            ))}
          </div>
          <ConsoleLabel className={styles.group}>Damage</ConsoleLabel>
          <div className={styles.chips}>
            {DAMAGE.map((stage) => (
              <AssetChip
                key={stage}
                active={damage === stage}
                tooltip={`Damage ${stage}`}
                onClick={() => onDamage(stage)}
              >
                {`Damage ${stage}`}
              </AssetChip>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
