# Shifting Front — Publication & Release Checklist

This guide outlines the complete operational checklist for publishing and deploying **Shifting Front** to production web hosting and gaming portals.

---

## 1. Pre-Flight Verification

Before cutting a release or publishing a production build, run the local verification suite:

```bash
# 1. Type check
yarn typecheck

# 2. Linting
yarn lint

# 3. Unit & simulation tests
yarn test:fast

# 4. Invariants & determinism suite
yarn health:invariants

# 5. Performance health (CI health job; p95 25 ms, p99 25 ms local / 40 ms CI)
yarn health:performance

# 6. Markdown documentation
yarn health:documentation

# 7. Dependency vulnerability audit
yarn health:audit

# 8. Visual regression test suite
yarn test:visual

# 9. Production Next.js build
yarn build
```

Ensure all gates pass with 0 errors and 0 warnings. `yarn health:balance` runs on CI and nightly; run it locally when changing the commander or `DEFAULT_BALANCE_THRESHOLDS`.

---

## 2. Production Web Deployment (`shiftingfront.com` / `www.shiftingfront.com`)

Shifting Front is a fully client-side Next.js application running on Vercel production hosting.

### Domain & DNS Verification

- [x] DNS records point to Vercel production deployment (`www.shiftingfront.com` with `308` redirect from apex `shiftingfront.com`).
- [x] SSL/TLS certificates active and enforcing HTTPS across both domains.
- [x] Security headers active: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a Content-Security-Policy covering default/script/style/img/font/connect/worker/object plus portal `frame-ancestors`.
- [x] Permission policy active: `Permissions-Policy: fullscreen=*, autoplay=*, clipboard-write=*`.
- [x] Static asset caching: `Cache-Control: public, max-age=31536000, immutable` for `/(art|icons)/:path*`.
- [x] Service worker registers and precaches core routes (`/`, `/tutorial`, `/briefing`, `/campaign`, `/play`, `/campaign-complete`, `/load`, `/privacy`, `/terms`) and icons as a required install set, then best-effort precaches all 112 visual art assets (biomes, 3D models, sprites, portraits, terrain, textures), and dynamically discovers/caches linked Next.js static bundles with offline query-parameter routing.
- [x] Universal social cards available at `/opengraph-image.png` and `/twitter-image.png`.

---

## 3. Web Game Portals (itch.io, Newgrounds, CrazyGames)

### itch.io Setup

The application is preconfigured with iframe frame-ancestor permissions for `https://*.itch.io`.

- **Embed Type**: Web game (HTML / Embed in page).
- **Direct Embed URL**: Point the itch.io embed to `https://www.shiftingfront.com`.
- **View Dimensions**: `1280 x 720` (or `1920 x 1080` with auto-scaling).
- **Fullscreen Button**: Enabled (browser fullscreen button provided in-game).
- **Orientation**: Landscape / Responsive.
- **Tags**:
  - `Real-time Strategy (RTS)`
  - `Isometric`
  - `Procedural Generation`
  - `Sci-Fi`
  - `Singleplayer`
  - `Base Building`
  - `Resource Management`

### Promotional Artwork Assets

Generated automatically via `yarn generate-promo`:

- **itch.io Cover Image**: `630 x 500` PNG at `docs/press/itch-cover-630x500.png` and `public/promo/itch-cover.png`.
- **Header Banner**: `1920 x 1080` PNG at `docs/press/banner-1920x1080.png`.
- **Gameplay Screenshots**: 5 high-resolution `1920 x 1080` PNGs ready for store upload in `docs/press/`:
  1. `screenshot-1-base-building.png` — Base expansion, ore refinery, and harvesters.
  2. `screenshot-2-tactical-combat.png` — Tactical combat skirmish, lasers, and unit selection rings.
  3. `screenshot-3-mission-briefing.png` — Operations briefing with faction portraits and objectives.
  4. `screenshot-4-campaign-dossier.png` — Campaign operation progression.
  5. `screenshot-5-command-vista.png` — Command desk panoramic vista.

---

## 4. Release Versioning & Tagging

1. Set `package.json` `version` and `lib/site.ts` `APP_VERSION` to the same target. `tests/platform/docsDrift.test.ts` fails if they diverge.
2. Move `CHANGELOG.md` `[Unreleased]` notes into a dated `## [X.Y.Z]` section. Keep an Unreleased heading for the next cycle. If `DEFAULT_BALANCE_THRESHOLDS` changed, Unreleased must still name the live floors (`minKindWinRate` and the per-kind targets).
3. Commit, tag, and push. The `v*` tag runs `.github/workflows/release.yml`.

   ```bash
   git tag -a vX.Y.Z -m "Shifting Front vX.Y.Z"
   git push origin master --tags
   ```

---

## 5. Ongoing operations

These are recurring process, not leftover launch TODOs.

- **Player reports**: In-game crashes open `.github/ISSUE_TEMPLATE/crash.md` with seed, mission, version, and diagnostics. Options and Credits open the bug form. Triage [GitHub Issues](https://github.com/zakaihamilton/shiftingfront/issues).
- **Weekly seed**: `weeklySeed()` rotates at Monday 00:00 UTC. Covered by `tests/ui/weeklyOperation.test.ts` and the menu **This Week** smoke in `tests/e2e/smoke.spec.ts`.
- **Save archive**: Export/import is covered by `tests/persistence/saveSlots.test.ts`. Release smoke: named slot, reload the tab, export JSON, import on a fresh profile.
