# Architecture

Shifting Front has a deterministic, browser-owned real-time strategy simulation. Campaign and tutorial play require no external service; multiplayer adds Next.js server routes for scoped Peerovo credentials. The URL seed and mission identify a generated campaign; the browser owns the mutable simulation session and persists it locally.

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

Battlefield terrain initialization and pixel baking run in a session-owned Web Worker, using copied terrain inputs and transferable pixel/water-mask buffers. Request IDs, atlas keys, and session generations reject stale results. The worker yields between row chunks for cancellation. If workers cannot load (including offline), the session disables further attempts and prepares one row per animation frame, including rebuilds after ore exhaustion changes the layout. Grain overlays clip to ground spans, preserving water without a full-canvas pixel readback. Preloading reserves the atlas while grain textures load, so the renderer uses its pending-atlas fallback instead of triggering a synchronous bake before preparation starts. Live rebuilds keep the previous atlas visible until replacement is ready. New layout requests cancel superseded work for that world, and session disposal cancels pending bakes.

The terrain surface raster is cached separately from the shroud and vision-gated props. Fog refreshes reuse geometry, textures, and the blurred map skirt; camera, canvas size, or atlas changes rebuild that surface. Session disposal clears the surface caches.

With `?perf=1`, the Canvas exposes separate drawing time (`data-perf-render-ms`), complete synchronous loop work (`data-perf-frame-ms`), and animation-callback intervals (`data-perf-frame-interval-ms`). Loop work includes simulation and runtime hooks; intervals also reflect React, layout, and browser scheduling between callbacks. Browser performance tests pause the stress fixture for cold terrain preparation, then resume play for warmup and 120 distinct frame samples. Local browsers enforce the renderer's 30 fps fallback: loop-work p95 below 33.33 ms, frame-interval median at most 34.33 ms, and interval p95 at most 50.1 ms, including timestamp-rounding headroom.

Hosted CI uses software Canvas rendering on two vCPUs. Its performance shard runs one browser worker and retains the previous 100 ms work ceiling, now measuring active simulation and the complete loop. Cadence has a 100.1 ms median and 150.1 ms p95 ceiling. These are regression limits for the hosted runner rather than proof of 30 fps on gaming hardware. Before surface caching, active CI work p95 was 279–327 ms; caching reduced it to 83–84 ms under two competing browser workers. Serialized CI measured desktop work p95 of 63–65 ms and mobile work p95 of 38 ms. Desktop intervals had an 83.3 ms median and 133.3 ms p95 despite median loop work of 17–21 ms, motivating the separate cadence ceiling. CI allows 30 seconds for cold atlas preparation and 60 seconds for each performance case; timing summaries are printed in CI logs.

Unit-test timing is published by `yarn ci:timed-tests` as `artifacts/test-timing.json`. The pre-refactor full-suite baseline was approximately 78 seconds wall-clock, with headless balance, balance regressions, terrain, commander, and profile suites as the principal hotspots. The exhaustive `yarn test` command has no hard duration gate; the timing report is the regression signal.

## Persistence boundaries

- `lib/persist/save`: versioned simulation serialization, per-seed autosaves, and named save slots.
- `lib/persist/save/migrations.ts`: content-version migrations shared by autosaves and named slots. Loaders accept integer content versions from 1 through `SAVE_CONTENT_VERSION` (currently 2) and apply each registry step. The version 1 → 2 migration moves per-building production queues into shared per-owner queues and selects active producers.
- `lib/persist/campaign`: unlocks, medals, and best scores.
- `lib/persist/settings`: audio and UI preferences.
- `lib/persist/telemetry`: bounded local mission metrics.
- `SaveRepository`: asynchronous IndexedDB transactions with campaign records (autosave, progress, revision), named slots (envelope, revision), and migration metadata.
- `SaveSession`: serialized immutable writes with transaction-level revision checks; localStorage fallback retains its best-effort conflict guard.

Repository initialization gates mission loading and archive entries. Explicit save/load actions may adopt a new snapshot. Implicit autosaves compare revisions inside the transaction and refuse external changes. Writes capture immutable payloads before awaiting storage; the runtime coalesces autosaves and ignores completions belonging to replaced missions. Autosaves run every 30 simulation seconds and at terminal states. Terminal saves commit autosave and campaign progress together; named saves commit slot and autosave together; restoring a slot commits autosave and campaign progress before loading or navigating. Cross-tab broadcasts refresh subscribed caches.

Existing content migrations and JSON import/export remain shared with legacy codecs. Validated legacy records migrate idempotently, retaining localStorage originals; later changes create recovery slots rather than replace newer records. Malformed records are quarantined for the archive recovery UI. Page hide writes a synchronous recovery journal with the expected revision; startup promotes it only when the revision matches, otherwise retaining it as a recovery slot. Settings and telemetry stay in localStorage. IndexedDB failures fall back to legacy storage with a visible reduced-reliability notice. Write failures remain failures, and clearing game data clears both backends, journals, and migration metadata.

The multiplayer protocol module owns DOM-free wire types, versioned match settings, command sanitization, and snapshot validation, deriving recognized entity kinds from the catalogs. `MultiplayerSession` retains the compatible public exports and owns command arbitration, tick queues, resynchronization, and forfeiture. Wire recognition does not grant simulation permissions such as production availability or ownership.

Multiplayer protocol 5 includes a deterministic SHA-256 build identity derived from sorted simulation, generation, catalogs, seed, shared types, protocol/checksum source and the dependency lockfile. Initial and reconnect handshakes reject mismatches before assigning a seat. Pending snapshots install through the loop's `beforeFrame` hook before state capture, pause decisions, and tick budgeting; replacement resets elapsed time and rebuilds the scenario runner. Viewpoint, fog, local groups, and seat-specific results remain local.

Initial, terminal, and 120-tick checks use canonical key/entity ordering and two seeded 32-bit FNV-1a hashes. Fog, control groups, command context, path-budget counters, and viewpoint are excluded; terminal results use the shared winner. Each peer retains eight checks. Verified divergence triggers a versioned authoritative snapshot and checksum acknowledgment. Failed verification or another verified divergence within 60 seconds ends the match with a synchronization error. Identity, protocol, tick, and checksum validation reject malformed and duplicate reports.

The host scheduler and guest validator share a 256-command tick-frame limit. Accepted commands beyond that budget remain queued for later ticks, preserving each queue's order. Guest intake is bounded to two frames of pending commands, and forfeiture removes that seat's deferred commands.

The lobby controller owns screen state, roster and seat policy, handshakes, and match launch. Its `PeerLifecycle` helper owns peer creation, credential refresh, requests, tracked connections, timers, signaling recovery, and disposal. Peer creation, requests, clocks, and timers are injected, retaining the browser-test PeerFactory seam. Each room operation has a generation; disposal invalidates that generation before closing resources, and asynchronous completions and connection callbacks check it before updating the active room. Recovery retains the existing 60-second deadlines and retry intervals.

Campaign persistence remains local. Online skirmishes use a stateless room API for short-lived Peerovo credentials and a host-arbitrated PeerJS data connection; they do not write campaign saves or progression. Future online campaign persistence should enter behind the `SaveRepository`/`SaveSession` boundary.

Mission navigation, including confirmed browser Back, saves the latest state before leaving. A failed or conflicting save keeps the mission open and displays a pause-menu notice. Loop presentation state follows the authoritative simulation object so restarting or loading in place resets terminal handling and per-session counters without replaying telemetry for an already-finished loaded mission.

## Adding a feature

1. Add or update the domain type in `lib/types.ts`.
2. Add a catalog or scenario definition.
3. Add simulation commands/events rather than reaching into UI state from the simulation.
4. Add focused unit tests, replay fingerprints, and invariants.
5. Connect the UI through `GameRuntimeFacade` and a surface adapter, keeping Canvas rendering and browser APIs out of the domain layer.
6. Add E2E coverage only for user-visible behavior, then run typecheck, lint, the full suite, build, and relevant health scripts.

For reproducible gameplay bugs, add a scheduled-order replay fixture using `lib/sim/replay.ts` and the existing `scripts/sim.ts --orders` format. Replay fingerprints exclude fog and normalize entity ordering, so they describe simulation behavior rather than renderer state. The fingerprints are internal deterministic regression fixtures, not a persisted external replay format; when simulation behavior changes, update the current baselines in `tests/simulation/replayCompatibility.test.ts` and document the reason. The rescue and extraction baselines currently reflect the intentional scenario-patrol behavior changes from the latest simulation update. Biome tactical modifiers also intentionally change movement, vision, targeting, and damage outcomes when seeded feature regions are active. No legacy fingerprint compatibility path is maintained.
