# Architecture

Shifting Front is a deterministic, client-side real-time strategy game. The URL seed and mission identify a generated campaign; the browser owns the mutable simulation session and persists it locally.

## Boundaries

```text
Next.js routes
  ├─ menu / tutorial / briefing / campaign screens
  ├─ play route
  │    └─ GameClient (client-only)
  │         ├─ TacticalScreen (presentational composition)
  │         │    ├─ Battlefield / play-field surface
  │         │    └─ React chrome and overlays
  │         ├─ Canvas input adapter
  │         └─ runtime hooks
  └─ public asset API

runtime hooks
  ├─ useGameRuntimeState  — campaign, initial state, refs, save session
  ├─ GameRuntimeFacade     — authoritative refs, command port, loop lifecycle
  ├─ useGameActions       — converts UI actions into queued Commands
  ├─ useGameInput         — pointer/touch selection and ground targeting
  ├─ useGameKeyboard      — keyboard shortcut adapter
  ├─ useGameSession       — pause, save/load, tutorial, and navigation
  ├─ useGameLoop          — browser effects around the simulation loop
  └─ useGameRenderer      — Canvas frame rendering and effects

runtime controllers
  ├─ GameRuntimeFacade     — stable browser runtime boundary and adapters
  ├─ RuntimeController     — fixed-step loop lifecycle and command/state wiring
  ├─ persistence coordinator — autosave, conflict retry, campaign progress, telemetry
  ├─ presentation coordinator — simulation events to audio, alerts, and FX
  ├─ frame coordinator      — camera pan, bounds, availability, and redraw timing
  ├─ surface adapter        — pure runtime-to-screen prop mapping
  └─ TacticalScreen         — presentational shell for play-field and overlays

runtime kernel
  ├─ grouped refs            — simulation, interaction, and rendering state
  ├─ grouped ports           — frame, presentation, persistence, and UI writes
  └─ RuntimeCommandPort      — the only queue boundary for browser intent

lib/gen + lib/sim
  └─ DOM-free deterministic game domain used by the UI, tests, and CLIs
```

The `lib/gen` and `lib/sim` layers must not import React, browser globals, or Canvas APIs. This keeps generated campaigns and simulation replays usable from Vitest and the headless scripts.

The gameplay runtime is the browser-side composition boundary. `useGameRuntime` assembles typed refs and ports, while the runtime controllers own lifecycle effects. `createGameRuntimeSurfaces` is a pure adapter from that runtime contract to screen props, and `TacticalScreen` only composes those presentational surfaces. New gameplay behavior should not be added to a controller: extend the domain model and public command/event API first, then connect the behavior through the UI adapter.

The runtime loop receives a grouped `RuntimeKernel`. The fixed-step controller consumes simulation, interaction, and rendering refs directly, with frame, presentation, and persistence ports kept in their respective groups. There is no intermediate flattened ref/port contract.

## Seed and generated content

`createCampaign(seed)` derives forked RNG streams for the world and its single campaign biome, factions, characters, story, mission objectives, and map inputs. Seeds are integers from `0000` through `9999`; generation and persistence entry points reject values outside that range so distinct inputs cannot collapse onto the same displayed or storage key. Every mission uses the campaign biome while retaining its own objective, profile, and map layout. `createMission({ seed, missionIndex })` turns the generated campaign and map into a mutable `SimState`.

Generated content is not saved. A save contains the current simulation state, including units, buildings, fog, queues, RNG state, objective runtime, and navigation revision. Regenerating from the same seed remains the source of truth for static campaign data.

`SimState.entities` is the authoritative mutable entity collection used by simulation, rendering, replay, and serialization. Entity objects are ordinary data records with no proxy or mirrored component stores. Structural helpers add or remove entities by replacing the array, which invalidates array-keyed query caches; they also enforce unique IDs, clear references to removed entities, and update navigation revisions for building changes. Save hydration normalizes the existing flat entity shape directly.

## Runtime state flow

```text
pointer / touch / keyboard / sidebar
                │
                ▼
        GameRuntimeFacade command port
                │
                ▼
        Command[] queue (ref)
                │
                ▼
requestAnimationFrame → lib/game/loop.ts
                │
                ├─ drains commands
                ├─ tick(state, commands)
                │    ├─ production → economy → movement
                │    ├─ combat → repair → support
                │    ├─ director → AI → fog → clock
                │    └─ scenario → objectives → cleanup
                │
                ├─ updates the authoritative state ref
                ├─ emits simulation events
                └─ redraws Canvas / HUD effects

state ref ──┬─ renderer and minimaps
            ├─ selection, camera, and hover logic
            ├─ audio event dispatch
            └─ autosave / terminal save / telemetry
```

The simulation is fixed-step (`12` ticks per second). Rendering may interpolate between ticks, but it must never mutate authoritative simulation state. The loop discards hidden-window time rather than simulating a large backlog when the tab regains focus.

React state is used for values that affect visible UI. Mutable refs hold the high-frequency state and interaction state so the Canvas loop does not require a React render on every simulation tick. `useGameLoop` publishes a shallow entity-array update periodically, after commands, and at terminal states.

## Commands and events

User intent enters through the public `Command` union in `lib/types.ts` and is applied by `issue` / `applyCommands` in `lib/sim/orders`. Simulation systems return `SimEvent` values for production, combat, objectives, alerts, and command rejection.

Keep gameplay rules in `lib/sim`. UI code should translate events into presentation effects such as sound, alerts, navigation, or overlays. Headless callers should use the same public API:

```ts
const state = createMission({ seed: 421, missionIndex: 0 });
const result = tick(state, commands);
```

## Navigation and performance

Static terrain and building occupancy are cached by `navigationRevision` in `staticNavigationFor`. Unit occupancy remains per-tick because units move frequently. Building placement, selling, cancellation, and destruction invalidate the revision. Flow fields and A* searches share this cached static grid.

Performance-sensitive work should be measured with `yarn health:performance`. The benchmark covers late-game simulation, terrain atlas generation, foreground routing, multi-destination flow fields, and blocked-line-of-sight combat. Simulation, routing, foreground orders, and blocked combat report p50/p95/p99/max. p95 stays on a 25 ms health budget. Simulation p99 is 25 ms locally and 40 ms in CI after a JIT warmup, because hosted 2-vCPU runners can GC above the p95 line; max remains diagnostic for isolated spikes. Simulation timings also separate commander planning from the mutable tick. Do not loosen a threshold without recording why the workload or target changed.

`DEFAULT_BALANCE_THRESHOLDS` in `lib/sim/balance/evaluation.ts` is the live balance gate (`yarn health:balance`). When those numbers change, name the live floors in `CHANGELOG.md` Unreleased; `tests/platform/docsDrift.test.ts` checks Unreleased against the code. `package.json` `version` and `APP_VERSION` must stay equal.

The battlefield preloads only terrain and raster sources for living entities in the current mission. Asset Bay previews and newly introduced unit types remain lazy, and the renderer's image/raster caches remain session-scoped.

Unit-test timing is published by `yarn ci:timed-tests` as `artifacts/test-timing.json`. The pre-refactor full-suite baseline was approximately 78 seconds wall-clock, with headless balance, balance regressions, terrain, commander, and profile suites as the principal hotspots. The exhaustive `yarn test` command has no hard duration gate; the timing report is the regression signal.

## Persistence boundaries

- `lib/persist/save`: versioned simulation serialization, per-seed autosaves, and named save slots.
- `lib/persist/save/migrations.ts`: pure content-version migrations shared by autosaves and named slots. Loaders accept integer content versions from 1 through `SAVE_CONTENT_VERSION` and apply each registry step; the live registry is empty while the format is still version 1.
- `lib/persist/campaign`: unlocks, medals, and best scores.
- `lib/persist/settings`: audio and UI preferences.
- `lib/persist/telemetry`: bounded local mission metrics.
- `SaveSession`: best-effort same-tab and cross-tab conflict detection around `localStorage`.

Explicit save/load actions may adopt a new snapshot. Implicit autosaves refuse to overwrite a detected external change so another tab is not silently lost. Named slots store a mission snapshot plus that moment's campaign progress. The campaign archive can export one validated named-slot envelope as JSON and import it as a fresh local slot; autosaves and pause-menu controls are intentionally excluded. A slot load writes both records before replacing the active mission or navigating. If campaign writing fails, it attempts to restore the previous autosave and reports any rollback failure; localStorage does not provide multi-key transactions. A successful named-slot write is reported as saved even if updating the separate autosave fails.

The product remains local-only. Future online persistence should enter behind the existing `StorageAdapter`/`SaveSession` boundary so runtime controllers continue to depend on save-session operations rather than `localStorage`; authentication, cloud synchronization, multiplayer networking, server authority, and save migration are intentionally out of scope.

Mission navigation, including confirmed browser Back, saves the latest state before leaving. A failed or conflicting save keeps the mission open and displays a pause-menu notice. Loop presentation state follows the authoritative simulation object so restarting or loading in place resets terminal handling and per-session counters without replaying telemetry for an already-finished loaded mission.

## Adding a feature

1. Add or update the domain type in `lib/types.ts`.
2. Add a catalog or scenario definition.
3. Add simulation commands/events rather than reaching into UI state from the simulation.
4. Add focused unit tests, replay fingerprints, and invariants.
5. Connect the UI through `GameRuntimeFacade` and a surface adapter, keeping Canvas rendering and browser APIs out of the domain layer.
6. Add E2E coverage only for user-visible behavior, then run typecheck, lint, the full suite, build, and relevant health scripts.

For reproducible gameplay bugs, add a scheduled-order replay fixture using `lib/sim/replay.ts` and the existing `scripts/sim.ts --orders` format. Replay fingerprints exclude fog and normalize entity ordering, so they describe simulation behavior rather than renderer state. The fingerprints are internal deterministic regression fixtures, not a persisted external replay format; when simulation behavior changes, update the current baselines in `tests/simulation/replayCompatibility.test.ts` and document the reason. The rescue and extraction baselines currently reflect the intentional scenario-patrol behavior changes from the latest simulation update. Biome tactical modifiers also intentionally change movement, vision, targeting, and damage outcomes when seeded feature regions are active. No legacy fingerprint compatibility path is maintained.
