import { ConsoleButton } from "@/components/ui/ConsoleButton";
import type { CommandTab } from "@/lib/ui/shortcuts";
import { cx } from "@/lib/ui/cx";
import { CommandTabIcon } from "./CommandTabIcon";
import styles from "./CommandTabs.module.css";

function CommandBarButton({
  icon,
  label,
  keyshortcuts,
  testId,
  tooltip,
  selected,
  pressed,
  tutorialFocus,
  onClick,
}: {
  icon: CommandTab | "repair" | "sell";
  label: string;
  keyshortcuts: string;
  testId?: string;
  tooltip: string;
  selected?: boolean;
  pressed?: boolean;
  tutorialFocus?: string;
  onClick: () => void;
}) {
  const on = selected ?? pressed ?? false;
  return (
    <ConsoleButton
      role={selected === undefined ? undefined : "tab"}
      aria-selected={selected}
      aria-pressed={pressed}
      aria-label={label}
      data-testid={testId}
      tooltip={tooltip}
      aria-keyshortcuts={keyshortcuts}
      muted={!on}
      className={cx(styles.tab, tutorialFocus && styles.tutorialFocus)}
      data-tutorial-focus={tutorialFocus}
      onClick={onClick}
    >
      <span className={styles.tabContent}>
        <CommandTabIcon type={icon} />
      </span>
    </ConsoleButton>
  );
}

export function CommandTabs({
  activeTab,
  repairMode,
  sellMode,
  onConstruction,
  onProduction,
  onSelected,
  onRepair,
  onSell,
  tutorialFocus,
}: {
  activeTab: CommandTab;
  repairMode: boolean;
  sellMode: boolean;
  onConstruction: () => void;
  onProduction: () => void;
  onSelected: () => void;
  onRepair: () => void;
  onSell: () => void;
  tutorialFocus?: "construction-tab" | "production-tab" | "repair-control";
}) {
  return (
    <div className={styles.tabs} role="toolbar" aria-label="Command options">
      <CommandBarButton
        icon="construction"
        label="Construction"
        keyshortcuts="q"
        tooltip="Build structures"
        selected={activeTab === "construction"}
        tutorialFocus={tutorialFocus === "construction-tab" ? tutorialFocus : undefined}
        onClick={onConstruction}
      />
      <CommandBarButton
        icon="production"
        label="Production"
        keyshortcuts="e"
        tooltip="Train units"
        selected={activeTab === "production"}
        tutorialFocus={tutorialFocus === "production-tab" ? tutorialFocus : undefined}
        onClick={onProduction}
      />
      <CommandBarButton
        icon="selected"
        label="Selected"
        keyshortcuts="t"
        testId="tab-selected"
        tooltip="Selected units"
        selected={activeTab === "selected"}
        onClick={onSelected}
      />
      <CommandBarButton
        icon="repair"
        label="Repair structures"
        keyshortcuts="r"
        testId="repair-mode"
        tooltip="Repair structures. Click a damaged building to start or stop."
        pressed={repairMode}
        tutorialFocus={tutorialFocus === "repair-control" ? tutorialFocus : undefined}
        onClick={onRepair}
      />
      <CommandBarButton
        icon="sell"
        label="Sell structures"
        keyshortcuts="f"
        testId="sell-mode"
        tooltip="Sell structures. Click a finished building to scrap it for credits."
        pressed={sellMode}
        onClick={onSell}
      />
    </div>
  );
}
