# Unit visuals

Unit presentation is independent of simulation state. Animation and transient
effects use the game's animation clock, freeze when it freezes, and clear through
`clearRenderSessionCaches` when a mission ends.

## Artwork

`lib/gen/unitAnimationManifest.json` registers eight directional views for each
action and each tank part. Infantry and Anti-armor have idle and firing sheets;
Medics have idle and treatment sheets. Sheets use four 512×512 frames in a 2×2
layout. The feet contact line is 500 pixels inside every frame.

Tanks and Behemoths have separate 512×512 hull, turret, and barrel images. Hull
contact is at pixel 475; turret and barrel pivots are respectively `(256, 300)`
and `(256, 256)`. Each view records its hull mount, barrel socket, and muzzle.
The renderer accounts for raster insets when placing these sockets. Rear-facing
barrels paint behind the turret; front-facing barrels paint above it.

The atlas export script accepts six generated source images plus an optional
three separately framed firing sheets. It extracts individually framed assets, calibrates
their anchors, and emits the manifest. Preserve source images outside the shipped
sprite directory. Follow [the unit art contract](adding-new-units.md) when
changing assets: increment URLs, register them, and update the service worker.

## Rendering

- `unitLighting.ts` applies cached silhouette lighting using the terrain light
  rig. Combat and repair events contribute at most eight local lights. Lighting
  rasters use a 256-entry LRU cache.
- `unitTransformTracker.ts` tracks movement distance and smoothed acceleration.
  `unitPresentation.ts` supplies breathing, engine vibration, suspension, turn
  lean, harvesting machinery, and valid support effects.
- `unitVehicleLayers.ts` blends hull and turret directions independently and
  records the weapon sockets used by projectile and muzzle effects.
- `unitTrails.ts` stamps footprints and tracks by distance in world coordinates.
  Surface and fog checks prevent road dust and hidden movement effects. Budgets
  cap persistent marks at 512 and transient particles at 192.
- `unitSpriteBlend.ts` preserves opacity during view and pose changes, reuses
  eight scratch sizes, and caches up to 128 shared pose composites.

Reduced motion keeps scene lighting, shadows, movement, and action readability
while disabling decorative body motion, exhaust, moving dust, gear animation,
and animated idle/work poses. Local light intensity is reduced.

## Inspection

Asset Bay offers action selection and independent tank turret aim. Inspect every
direction, then verify movement, braking, firing, gathering, and support on the
battlefield at multiple zoom levels. Pay particular attention to feet, track
contact, barrel sockets, and fog boundaries.

Focused regression coverage lives in `tests/rendering/unitPresentation.test.ts`,
`unitTransformTracker.test.ts`, `unitFacingBlend.test.ts`, and `anim.test.ts`.
Also run asset, service-worker, immutable URL, type, lint, build, and browser
checks before publishing changes.
