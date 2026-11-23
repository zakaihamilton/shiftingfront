"use client";

import { useMemo } from "react";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import {
  type AssetCategoryFilter,
  type CatalogAsset,
  filterGeneratedAssets,
} from "@/lib/gen/assetCatalog";
import { AssetChip } from "./AssetChip";
import styles from "./AssetList.module.css";
import { AssetListItem } from "./AssetListItem";

const FILTERS: readonly { value: CatalogAsset["category"] | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unit", label: "Units" },
  { value: "building", label: "Buildings" },
  { value: "wreck", label: "Wrecks" },
  { value: "rubble", label: "Rubble" },
];

export function AssetList({
  assets,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
}: {
  assets: CatalogAsset[];
  selectedId: string;
  onSelect: (id: string) => void;
  filter: AssetCategoryFilter;
  onFilterChange: (filter: AssetCategoryFilter) => void;
}) {
  const visibleAssets = useMemo(() => filterGeneratedAssets(assets, filter), [assets, filter]);

  return (
    <div className={styles.pane}>
      <div className={styles.headingRow}>
        <ConsoleLabel className={styles.heading}>Art library</ConsoleLabel>
        <span className={styles.count}>
          {visibleAssets.length}/{assets.length}
        </span>
      </div>
      <div className={styles.filters} role="toolbar" aria-label="Filter art library">
        {FILTERS.map((item) => (
          <AssetChip
            key={item.value}
            active={filter === item.value}
            tooltip={`Show ${item.label.toLowerCase()}`}
            onClick={() => onFilterChange(item.value)}
          >
            {item.label}
          </AssetChip>
        ))}
      </div>
      <div className={styles.list} role="listbox" aria-label="Art library">
        {visibleAssets.map((asset) => (
          <AssetListItem
            key={asset.id}
            asset={asset}
            selected={asset.id === selectedId}
            onSelect={() => onSelect(asset.id)}
          />
        ))}
      </div>
    </div>
  );
}
