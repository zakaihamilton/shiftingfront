import type { BuildingKind, Entity, FactionVisualProfile, Formation, Palette, SimState, Stance, UnitKind } from "@/lib/types";
import type { CommandTab } from "@/lib/ui/shortcuts";

export type CommandCatalogActions = {
  onPlace: (kind: BuildingKind) => void;
  onCancelBuilding: (kind: BuildingKind) => void;
  onQueueUnit: (unit: UnitKind) => void;
  onCancelUnit: (unit: UnitKind) => void;
  availableProducer: (unit: UnitKind) => Entity | undefined;
  onStop: () => void;
  onStance: (stance: Stance) => void;
  onFormation: (formation: Formation) => void;
  selectionCount?: number;
};

export type CommandBuildControls = CommandCatalogActions & {
  state: SimState;
  palette: Palette;
  profile: FactionVisualProfile;
  selected: Entity | undefined;
  placeKind: BuildingKind | null;
  repairMode: boolean;
  sellMode: boolean;
  activeTab: CommandTab;
  power: number;
  onTab: (tab: CommandTab) => void;
  onRepair: () => void;
  onSell: () => void;
};

export type CommandCatalogContentProps = CommandCatalogActions & {
  state: SimState;
  palette: Palette;
  profile: FactionVisualProfile;
  activeTab: CommandTab;
  placeKind: BuildingKind | null;
  selected: Entity | undefined;
  selectionCount?: number;
  power: number;
  selectedClassName?: string;
};
