# Adding a New Unit

Use this guide whenever a new unit is added to Shifting Front. It is written so
an AI can implement the unit and create its art without needing the directional
sprite requirements repeated in the request.

## Copy-paste implementation brief

Fill in the bracketed values, then give this entire brief to the AI working on
the unit:

```text
Add a new Shifting Front unit.

Unit identity:
- UnitKind: [camelCase identifier]
- Display name: [player-facing name]
- Role: [economy | combat | support | objective]
- Domain: [human | vehicle | air]
- Producer: [barracks | factory | runway | scenario-only]
- Gameplay behavior: [short description]
- Stats: [hp, speed, damage, range, cooldown, cost, buildTicks, sight,
  carryMax, armor, weapon, splashRadius, suppression]
- Special fields: [support or aircraft fields, if any]
- Walk cycle: [yes/no]

Implementation requirements:
1. Add the UnitKind to lib/types.ts.
2. Add it to UNIT_KINDS and UNIT_DEFINITIONS in lib/catalog/units.ts.
3. If it is produced by a building, add it to that building's production list
   in lib/catalog/buildings.ts.
4. Add its complete eight-view directional roster to
   lib/gen/visualAssets.ts.
5. Add every art file to public/sw.js PRECACHE_URLS.
6. Search for UnitKind and hard-coded unit-kind branches and update any logic
   that must explicitly understand this role, domain, producer, support type,
   or aircraft behavior.
7. Add or update focused tests for the catalog, production behavior, and art.
8. Run the verification commands at the end of this guide.

Do not silently substitute one existing unit's art or rotate one raster image
for all directions. Every playable unit must have eight mapped directional
views. Use the art-generation contract below exactly.
```

## Directional art contract

Every unit must have eight separate static WebP files. Do not submit a single
image, a contact sheet, or one image rotated by the renderer.

| Game facing | View name | Filename suffix |
| ---: | --- | --- |
| `0` | right | `-right-v1.webp` |
| `1` | front-right | `-front-right-v1.webp` |
| `2` | front | `-front-v1.webp` |
| `3` | front-left | `-front-left-v1.webp` |
| `4` | left | `-left-v1.webp` |
| `5` | back-left | `-back-left-v1.webp` |
| `6` | back | `-back-v1.webp` |
| `7` | back-right | `-back-right-v1.webp` |

For a unit whose identifier is `scoutBike`, the preferred files are:

```text
public/art/sprites/sleek-modular/scout-bike-right-v1.webp
public/art/sprites/sleek-modular/scout-bike-front-right-v1.webp
public/art/sprites/sleek-modular/scout-bike-front-v1.webp
public/art/sprites/sleek-modular/scout-bike-front-left-v1.webp
public/art/sprites/sleek-modular/scout-bike-left-v1.webp
public/art/sprites/sleek-modular/scout-bike-back-left-v1.webp
public/art/sprites/sleek-modular/scout-bike-back-v1.webp
public/art/sprites/sleek-modular/scout-bike-back-right-v1.webp
```

Use these art rules for every static view:

- Export a transparent WebP with an alpha channel.
- Put exactly one unit on the canvas; do not include terrain, UI, text,
  labels, borders, other units, or a baked-in contact shadow.
- Keep the same apparent scale, camera, lighting direction, material language,
  silhouette proportions, and transparent margins across all eight views.
- Keep the unit centered horizontally and place its feet or ground contact
  point at the same vertical position in every view. This contact point is the
  world anchor used by the Canvas renderer.
- Author the actual view from that direction. Do not mirror a front view into a
  back view or rely on renderer rotation to create missing directions.
- Preserve the unit's readable silhouette at the battlefield's small scale.
- Use kebab-case filenames and a version suffix such as `-v1`. Increment the
  suffix when replacing an art roster with an incompatible framing or design.
- A shared canvas is preferred. For a normal compact ground unit, use a
  transparent 384x512 canvas unless the unit deliberately needs another
  framing. If the source canvas has neighboring artwork or unusual margins,
  add a `UNIT_DIRECTION_CROPS` entry after inspecting it rather than guessing.

The source files are mapped in `UNIT_DIRECTION_ART` in
`lib/gen/visualAssets.ts`. The object must contain exactly one entry for every
view above. Its `Record<UnitKind, ...>` type is intentional: adding the unit to
`UnitKind` before adding all eight paths should produce a compile-time error.

### Static-art generation prompt

```text
Create production sprite assets for a small isometric real-time strategy game.
The unit is [UNIT NAME], a [ROLE] [DOMAIN] with this silhouette and equipment:
[UNIT DESCRIPTION]. Match the existing Shifting Front visual language: crisp
industrial modular construction, restrained tactical colors, readable geometry,
consistent neutral lighting, and a strong silhouette at small battlefield size.

Generate eight separate images, one file per view, not a contact sheet:
right, front-right, front, front-left, left, back-left, back, back-right.
Use the same unit design, scale, camera elevation, lighting, materials, and
transparent canvas framing in every image. Keep the unit centered horizontally
and keep the feet/base at exactly the same vertical contact line in every view.
Use a transparent 384x512 canvas for a standard ground unit unless a different
canvas is explicitly requested. Export transparent WebP files named
[slug]-right-v1.webp, [slug]-front-right-v1.webp,
[slug]-front-v1.webp, [slug]-front-left-v1.webp,
[slug]-left-v1.webp, [slug]-back-left-v1.webp,
[slug]-back-v1.webp, and [slug]-back-right-v1.webp.

Include exactly one unit per image. Do not include a background, terrain,
grid, UI, text, labels, border, contact shadow, muzzle flash, or other units.
Do not rotate, mirror, crop off, or redesign the unit between views. Do not
combine the views into a sprite sheet. Preserve transparent margins and leave
enough room around the silhouette so no equipment is clipped.
```

## Optional walk-cycle art

Only units with visible legs and feet should receive walk-cycle art. Vehicles,
aircraft, and units whose movement does not need leg animation should use their
static directional art while moving.

For a walking unit, create eight additional files under:

```text
public/art/sprites/sleek-modular/walk-cycle/
```

Each file must follow the directional name plus `-walk-v1.webp`, for example
`scout-trooper-front-walk-v1.webp`. Each sheet
must have all of these properties:

- 1024x1024 transparent WebP canvas.
- Four 512x512 frames arranged as a 2x2 sheet.
- Frame order: top-left `0`, top-right `1`, bottom-left `2`, bottom-right `3`.
- The same facing, scale, lighting, silhouette, horizontal center, and foot
  contact line in all four frames.
- No background, ground plane, text, or baked shadow.

Add the unit to the `WalkerKind` union and `UNIT_WALK_CYCLE_ART` map in
`lib/gen/visualAssets.ts`. The renderer uses `unitWalkFrameCrop`, so do not
change the 2x2 layout or frame order for an individual unit.

## Aircraft exception

Aircraft are not ordinary ground units. The current strike-plane implementation
uses top-down 1536x1024 directional rasters, centers the aircraft in the world
frame, and uses view-specific image anchors in
`STRIKE_PLANE_IMAGE_ANCHORS`.

When adding an aircraft:

- Follow the existing `strikePlane` branch in `lib/gen/svgArt.ts` rather than
  assuming the ground-unit bottom anchor is correct.
- Add an explicit eight-view map and view-specific anchors.
- Do not add aircraft to a walk cycle.
- Preserve the existing rear-diagonal convention. The logical `back-left`
  facing currently uses the authored `back-right` file, and logical
  `back-right` uses the authored `back-left` file. This is a deliberate
  correction for the top-down aircraft art and must not be copied to ordinary
  ground units without checking the authored views.

## Code integration checklist

### 1. Type and catalog

- Add the new literal to `UnitKind` in `lib/types.ts`.
- Add it to `UNIT_KINDS` in `lib/catalog/units.ts`.
- Add a complete `UNIT_DEFINITIONS` entry with its label, `renderKey`, AI role,
  stats, domain, and producer.
- Add `scenarioOnly`, support fields, `targetDomains`, or `ammoMax` only when
  the unit actually needs them.
- If produced by a building, add it to the relevant `production` array in
  `lib/catalog/buildings.ts`.
- If the unit needs special simulation behavior, inspect production, movement,
  combat, support, AI, audio, tooltips, and save validation for explicit
  assumptions about the existing unit kinds.

### 2. Art registration

- Add all eight static paths to `UNIT_DIRECTION_ART`.
- Add `UNIT_DIRECTION_CROPS` only when source artwork requires a crop; keep the
  crop values tied to the actual source dimensions.
- Add walk-cycle paths and the `WalkerKind` entry only for walking units.
- Extend the aircraft-specific maps and renderer branch for air units.
- Do not leave unused `.webp` files in the sprite directory. The asset tests
  require every shipped sprite to be referenced.

### 3. Offline and preview surfaces

- Add every new `.webp` path to `PRECACHE_URLS` in `public/sw.js`.
- Confirm the unit appears in Asset Bay automatically through `UNIT_KINDS`.
- Rotate through all eight Asset Bay facings and inspect both static and walk
  previews, if applicable.
- Confirm wreck rendering reuses the correct directional live asset.

## Verification

Run the focused checks first:

```bash
yarn test tests/generation/assets.test.ts tests/platform/serviceWorker.test.ts
yarn typecheck
yarn lint
yarn health:documentation
```

For a gameplay unit that changes simulation or UI behavior, also run:

```bash
yarn test
yarn build
```

Manual Asset Bay acceptance criteria:

- The new unit is listed under Units.
- All eight views show the same unit with the correct facing.
- No view is missing, mirrored incorrectly, clipped, or visibly shifted from
  the shared ground/contact line.
- Walking frames stay planted instead of bouncing or sliding.
- Wreck art remains aligned with the live unit.
- The service-worker test reports no missing precached art files.
