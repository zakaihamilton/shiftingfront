import { useEffect, useRef } from "react";
import type { CatalogAsset } from "@/lib/gen/assetCatalog";
import { cx } from "@/lib/ui/cx";
import styles from "./AssetListItem.module.css";

const CATEGORY_LABEL: Record<CatalogAsset["category"], string> = {
  unit: "Units",
  building: "Buildings",
  wreck: "Wrecks",
  rubble: "Rubble",
};

export function AssetListItem({
  asset,
  selected,
  onSelect,
}: {
  asset: CatalogAsset;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!selected) return;
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      className={cx(styles.item, selected && styles.active)}
      data-tooltip={`${CATEGORY_LABEL[asset.category]} · ${asset.label}`}
      data-tooltip-pos="right"
      onClick={onSelect}
    >
      <span className={styles.cat}>{CATEGORY_LABEL[asset.category]}</span>
      <span className={styles.name}>{asset.label}</span>
    </button>
  );
}
