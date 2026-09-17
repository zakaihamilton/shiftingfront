import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const instrumentedTimeout = process.env.NODE_V8_COVERAGE || process.env.VITEST_COVERAGE ? 180_000 : 30_000;

export default defineConfig({
  test: {
    environment: "node",
    pool: "threads",
    // The simulation suites are CPU-bound. A bounded pool lets independent
    // seed partitions run in parallel without starving the long commander and
    // balance cases that otherwise exceed their per-test budgets.
    maxWorkers: 8,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    // Keep focused coverage tolerant of V8 overhead; exhaustive checks run in
    // the dedicated invariant gate instead of consuming this budget.
    testTimeout: instrumentedTimeout,
    hookTimeout: instrumentedTimeout,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Keep the gate global for deterministic domain/UI modules. Canvas painting,
      // Web Audio, and generated art tables stay under E2E or browser smoke
      // coverage rather than distorting the unit-test signal.
      include: [
        "app/api/assets/**/*.ts",
        "lib/catalog.ts",
        "lib/iso.ts",
        "lib/gen/campaign.ts",
        "lib/gen/objectives.ts",
        "lib/gen/story.ts",
        "lib/persist/**/*.ts",
        "lib/seed/**/*.ts",
        "lib/sim/**/*.ts",
        "lib/ui/**/*.ts",
        "components/campaign/campaignSummary.ts",
        "components/campaign/CampaignCompleteScreen.tsx",
        "components/briefing/BriefingScreen.tsx",
        "components/briefing/briefingWrap.ts",
        "components/briefing/useBriefingController.ts",
        "components/briefing/useBriefingTypewriter.ts",
        "components/game/CommandCatalogContent.tsx",
        "components/game/GameOverlays.tsx",
        "components/game/gameOverlayModel.ts",
        "components/game/playFieldStatus.ts",
        "components/game/GamePauseSurface.tsx",
        "components/game/GameSidebarSurface.tsx",
        "components/game/MobileCommandLauncher.tsx",
        "components/game/MobileTouchControls.tsx",
        "components/game/PauseMenu.tsx",
        "components/settings/PauseOptions.tsx",
        "components/game/hooks/canvasPointer.ts",
        "components/game/hooks/gameActions.ts",
        "components/game/hooks/gameInputOrders.ts",
        "components/game/hooks/gameKeyboard.ts",
        "components/game/hooks/gameLoopEffects.ts",
        "components/game/hooks/gamePointerUp.ts",
        "components/game/hooks/missionConfirmation.ts",
        "lib/navigation/routes.ts",
        "components/game/hooks/useCombatAlert.ts",
        "components/game/hooks/useGameActions.ts",
        "components/game/hooks/useGameRenderer.ts",
        "components/game/hooks/useGameAudioLifecycle.ts",
        "components/game/hooks/useGameKeyboard.ts",
        "components/game/hooks/useGameSelection.ts",
        "components/menu/menuLaunch.ts",
        "components/menu/MenuOverlay.tsx",
        "components/menu/MenuScreen.tsx",
        "components/menu/NewGameSetup.tsx",
        "components/menu/SeedEntry.tsx",
        "components/menu/useMenuController.ts",
        "components/ui/ConsoleButton.tsx",
        "components/ui/ConsoleLabel.tsx",
        "components/ui/MetalPanel.tsx",
      ],
      exclude: [
        "**/*.module.css",
      ],
      thresholds: {
        statements: 70,
        lines: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": root,
    },
  },
});
