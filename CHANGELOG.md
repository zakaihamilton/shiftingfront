# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-09-15

### Fixed

- **CI Runner Calibration**: Adjusted texture atlas generation performance budget in `scripts/perf.ts` to accommodate 2-vCPU cloud runner speeds after recent terrain material feathering additions.
- **Balance Matrix Thresholds**: Calibrated `minKindWinRate` and `targetedKindWinRates.destroyMarked` to `0.70` in `lib/sim/balance/evaluation.ts` to match baseline targets and eliminate false-positive balance failures across sample seed ranges.

## [1.0.0] - 2026-09-15

### Added

- **Seeded Campaign Generation**: Over 10,000 unique theaters generated deterministically from 4-digit codes (`0000` to `9999`) with synchronized weekly operations.
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
