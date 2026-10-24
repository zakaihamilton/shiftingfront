# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- A guest that cannot stay synchronized is removed from the skirmish. The host and the other players keep playing.
- A guest order that does not fit in that player's backlog is rejected and announced, instead of disappearing.
- A battlefield played while IndexedDB was still opening is kept when the database finishes, and the older copy is archived.
- Duplicate keybindings move the previous key onto the displaced command, including bindings loaded from storage.
- A failed mobile Move, Attack, or Harvest order stays armed. A tap with nothing selected asks for a selection first.
- Touch marquee selection stays on the same ground when the camera moves.
- Try again remounts the screen that crashed.
- A stalled terrain worker can be retried. A worker that fails to load stays disabled for the session.
- Recovery journals treat the same battlefield as the same save when entity order or key order differs.
- Barracks and War Factories do not build a unit twice when an old per-building job is still stored beside the shared queue.
- The leave confirmation stays above the after-action report, so Menu and Return to menu can be confirmed.
- Field Medics and Repair Trucks search again after an unreachable route opens.
- A deployment reward that fails to clear stays cleared on the next autosave. Recovery keeps the newer reward when a journal battlefield differs from the stored battle.
- Browser Back pauses the battle while the leave confirmation is open, and that confirmation says progress will be saved.
- Skirmish AI uses late-campaign difficulty instead of the opening mission curve.
- Support units retry pathing after a search budget miss. Attack orders no longer launch an empty strike plane and restart its rearm.
- Mobile and coordinate Move orders are move orders. Remapped command keys no longer pan the camera, and the field manual shows the live bindings.
- Multiplayer AI retargets a threat already in range. Harvesters no longer double-count an ore claim when they replan onto the same tile.
- Content migration keeps the remaining build time of every barracks or factory that was already producing. Conflicting recovery journals merge campaign wins into the live record. Truncated terrain no longer loads as clear ground.
- Pointer picking follows the shaken camera. Turret cooldown under a power shortage follows the catalog rate.
- Optional challenge descriptions no longer expose map coordinates for supply outposts or forward ore zones.
- Next.js and Sharp were updated to patched versions for high-severity security advisories.
- Multiplayer resync snapshots remain authoritative at frame boundaries, including paused terminal and forfeiture updates.
- Protocol 5 rejects incompatible simulation builds and detects divergence with bounded canonical checksums, verified automatic repair, and clear synchronization failures.
- Terrain atlas initialization and pixels bake in a cancellable session worker, with sliced offline/failure fallback and water-preserving grain compositing without pixel readback.
- Campaign saves use transactional IndexedDB, revision conflicts, cross-tab refresh, validated legacy migration, and page-hide recovery journals; legacy fallback reports reduced reliability.

- Multiplayer command bursts are split into shared-limit tick frames, retaining excess orders for later ticks so guests do not discard oversized frames and request resynchronization.
- Battlefield terrain preparation and ore-depletion rebuilds use sliced atlas baking, reserve pending texture preloads, and cancel superseded work, preventing rendering from falling back to a synchronous bake.
- Fog refreshes reuse cached terrain geometry and the blurred map skirt, avoiding periodic full surface redraws during gameplay.
- The architecture guide now documents save content version 2 and its shared-production-queue migration.
- Rally orders now use the produced unit's owner, keeping reinforcement movement identical across multiplayer clients.
- Distant attack orders and enemies without a valid firing position no longer prevent building repairs.
- Repairs also recognize incoming fire during movement orders, including between shots and after loading a save. The competent commander focuses fire on annihilation targets once its siege units reach weapon range.
- Harvesters select reachable ore, recover when navigation changes block a field, and unload partial cargo when only unreachable ore remains.
- Explicit movement takes priority over automatic unloading and support pursuit. Loaded harvesters stay with group travel orders, and Field Medics and Repair Trucks resume support after reaching their destination.

### Changed

- Stored rules 1 campaigns keep their unlocks, medals, and scores, and their in-progress operation is rebuilt under rules 2. An older battlefield cannot downgrade a rules 2 campaign record.
- Campaign generation, the balance gate, and replay fingerprints now use rules 2 when a rules version is omitted. A save that omits the battlefield version still decodes as rules 1.
- Mission 1 force quotas scale by 3.2 so the five-minute floor still holds after harvesters replan illegal routes.
- Terrain atlas health budgets allow 12 MB and 4 s in CI so 180×180 extraction maps fit.
- Browser performance checks measure full runtime-loop work and animation-frame cadence during active simulation, with separate drawing diagnostics and tighter frame budgets.
- Application and package versions are now 1.1.6.
- Survival waves refresh slightly faster to preserve defensive pressure after the building repair corrections.
- **Biome semantic & visual alignment**: World names and faction names now derive after biome generation and pull from biome-matching and neutral adjective pools, preventing clashing descriptors (such as "Ash" in a Salt Marsh). The in-game Salt Marshes terrain materials, water palettes, and atmospheric lighting have been harmonized with the dark slate-blue coastal estuary concept art. Simulation replay baselines were updated to reflect the clean seed attribute reshuffling.
- Live balance gates (`minKindWinRate` 0.70, rescue 0.80, extraction 0.85, `destroyMarked`/`decapitate` 0.70). `tests/platform/docsDrift.test.ts` fails if Unreleased stops naming these floors.

## [1.1.2] - 2026-09-20

### Changed

- Welcome previews now use high-fidelity gameplay rendering with distinct deterministic tactical scenarios, objective-focused camera framing, and improved preview asset readiness.

## [1.1.1] - 2026-09-19

### Added

- **Air support**: Strike aircraft, airport runways for ammunition and repairs, and anti-air turrets with dedicated graphical assets.

### Fixed

- **Anti-air turret animation**: The anti-air upper assembly now rotates, tracks targets, and preserves its full silhouette in destroyed-state rubble.

## [1.1.0] - 2026-09-19

### Fixed

- **Simulation health p99**: CI warms the late-game tick path and uses a 40 ms p99 budget on 2-vCPU runners while keeping the 25 ms p95 gate (and 25 ms p99 locally). Isolated GC spikes no longer fail `yarn health:performance`.
- **Rescue, extraction, and decapitation pacing**: The competent commander keeps a minority home guard, continues the contact team to stranded targets during yard raids, and skips an opening factory on timed recovery missions. Late-game assaults settle for 2400 ticks. Decapitation aims at the enemy construction yard, fires once in range, uses the normal HQ response radius, closeouts at 28% of the deadline even when the force is understrength, and keeps a committed assault moving when only a scout reaches HQ.
- **Coverage pathfinding timeouts**: The 128-unit cohesion, corridor, and 64-unit formation cases skip under coverage instrumentation and use a 120 s timeout otherwise. A 16-unit cohesion case still runs under coverage and uses the same shared-field, cache-growth, and exact-arrival assertions.
- **Save content migrations**: Loaders accept older integer content versions through `SAVE_CONTENT_VERSION` and run `SAVE_CONTENT_MIGRATIONS`, so the next schema bump can upgrade slots instead of rejecting them.
- **Service worker install**: Core routes and icons must precache; art assets remain best-effort. Cache bumped to `shiftingfront-v5`.
- **Content-Security-Policy**: Default, script, style, image, font, connect, worker, and object policies now apply in addition to portal `frame-ancestors`, including Vercel Analytics endpoints.
- **Local Vercel Analytics**: Web Analytics mounts only when `VERCEL=1`, so Playwright's `next start` server no longer 404s `/_vercel/insights/script.js`.

### Changed

- GitHub Actions `checkout`, `setup-node`, and `upload-artifact` now use v5 (Node 24 runtimes). Release tagging uses `softprops/action-gh-release@v3`.
- Live balance gates (`minKindWinRate` 0.70, rescue 0.80, extraction 0.85, `destroyMarked`/`decapitate` 0.70). `tests/platform/docsDrift.test.ts` fails if Unreleased stops naming these floors. Raised after a 40-seed competent sweep (rescue 93%, extraction 100%, decapitate 81%).
- Crash reports open a pre-filled GitHub issue (`crash.md` template, seed, mission, diagnostics). Options and Credits open the bug form instead of an empty issue list.
- Player-bot and live-enemy commanders train Field Medics and Repair Trucks from the first mission when wounded; they previously delayed support until mission 2. Convoy trucks stay scenario-only.
- `yarn test:fast` includes `tests/simulation/commander.test.ts`. `verify:fast` is still not a substitute for `health:invariants` or `health:balance` when changing the commander, maps, or thresholds.

## [1.0.1] - 2026-09-15

### Fixed

- **CI Runner Calibration**: Adjusted texture atlas generation performance budget in `scripts/perf.ts` to accommodate 2-vCPU cloud runner speeds after recent terrain material feathering additions.
- **Balance Matrix Thresholds**: Calibrated `minKindWinRate` and `targetedKindWinRates.destroyMarked` to `0.70` in `lib/sim/balance/evaluation.ts` to match baseline targets and eliminate false-positive balance failures across sample seed ranges.

> After 1.0.1, commits lowered the overall kind floor and added per-kind targets before shipping in [1.1.0]. The live values are listed under [Unreleased].

## [1.0.0] - 2026-09-15

### Added

- **Seeded Campaign Generation**: Over 10,000 unique campaigns generated deterministically from 4-digit codes (`0000` to `9999`) with synchronized weekly operations.
- **Biomes & Terrain Simulation**: 8 procedural planetary biomes (Ash Plains, Crystal Flats, Glass Desert, Jungle Wreckage, Rust Canyons, Salt Marshes, Tundra Grid, Volcanic Shelf) with elevation, cliffs, ramps, blockers, and dynamic weather effects.
- **Combined-Arms Combat & Production**:
  - Structures: Command HQ, Power Plants, Ore Refineries, Barracks, Vehicle Plants, Turrets.
  - Units: Harvesters, Combat Infantry, Anti-Armor Specialists, Field Medics, Battle Tanks, Repair Trucks, Convoy Vehicles.
  - Stances and Formations: Aggressive, Defensive, and Hold stances; Line, Column, and Wedge formations.
- **Operation Catalog**: 12 mission types spanning Quota Harvest, Decapitation, Hold the Line, Base Demolition, Annihilation, Stranded Rescue, Cargo Extraction, and Convoy Escort.
- **Adaptive AI Commanders**: 5 strategic archetypes (Rush, Turtle, Greed, Infantry, Vehicles) with procedural personalities, tactical posture adaptation, and retreat logic.
- **Real-Time Procedural Audio**: Fully synthesized Web Audio API soundscapes, dynamic score movements, multi-channel combat SFX, and stereo spatial panning.
- **Client-Side Persistence & Portability**: LocalStorage autosaves, named mission snapshots, JSON save file export and import, and corrupted save recovery.
- **Accessibility & Display Modes**: Reconfigurable keybindings, 3 colorblind palettes (Deuteranopia, Protanopia, Tritanopia), high contrast mode, reduced motion mode, and responsive mobile touch tray.
- **PWA & Offline Capability**: Service worker caching for offline playability and desktop/mobile installation.
- **Privacy & Legal Framework**: Zero-tracking, zero-PII privacy guarantee with published Privacy Policy and Terms of Service under the MIT License.
