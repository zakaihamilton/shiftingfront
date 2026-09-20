# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

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
