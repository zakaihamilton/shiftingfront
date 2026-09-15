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

# 5. Production Next.js build
yarn build
```

Ensure all gates pass with 0 errors and 0 warnings.

---

## 2. Production Web Deployment (`shiftingfront.com`)

Shifting Front is a fully client-side Next.js application that runs on any modern web host supporting Next.js (Vercel, Cloudflare Pages, AWS, Netlify, or self-hosted Node/Docker).

### Domain & DNS Verification

- [ ] Confirm DNS records for `shiftingfront.com` point to the production deployment target (e.g. Vercel CNAME `cname.vercel-dns.com` or A records `76.76.21.21`).
- [ ] Verify SSL/TLS certificates are active and enforcing HTTPS.
- [ ] Verify `https://shiftingfront.com` redirects `http://` traffic to `https://`.

### Production Headers & Caching

- [ ] Security headers active: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] Permission policy active: `Permissions-Policy: fullscreen=*, autoplay=*, clipboard-write=*`.
- [ ] Static asset caching: `Cache-Control: public, max-age=31536000, immutable` for `/(art|icons)/:path*`.
- [ ] Service worker registers and precaches all core routes: `/`, `/tutorial`, `/briefing`, `/campaign`, `/play`, `/campaign-complete`, and `/load`.

---

## 3. Web Game Portals (itch.io, Newgrounds, CrazyGames)

### itch.io Setup

The application is preconfigured with iframe frame-ancestor permissions for `https://*.itch.io`.

- **Embed Type**: Web game (HTML / Embed in page).
- **Direct Embed URL**: Point the itch.io embed to `https://shiftingfront.com`.
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

- **Cover Image**: `630 x 500` PNG/WebP (using `public/art/menu-command-vista.webp` or calibrated campaign crop).
- **Screenshots**: At least 3–5 gameplay screenshots showing:
  1. Base building with harvesters and ore fields.
  2. Tactical combat with combat laser effects and health meters.
  3. Tactical mission briefing with faction portraits.
  4. Campaign dossier screen showing 6 operations.

---

## 4. Release Versioning & Tagging

1. Ensure `package.json` reflects the target version:

   ```json
   "version": "1.0.0"
   ```

2. Commit release changes:

   ```bash
   git commit -m "release: v1.0.0 — initial public launch"
   ```

3. Tag the release:

   ```bash
   git tag -a v1.0.0 -m "Shifting Front v1.0.0 — seeded isometric RTS"
   git push origin master --tags
   ```

---

## 5. Post-Launch Monitoring

- [ ] **Player Diagnostics**: Monitor GitHub Issues (`https://github.com/zakaihamilton/shiftingfront/issues`) for reports submitted via the in-game ErrorBoundary or Options feedback links.
- [ ] **Weekly Seed Rotation**: Confirm the synchronized weekly operation updates correctly at UTC boundaries.
- [ ] **Local Storage**: Verify that saves survive browser tab reloads and that the Save Archive export/import functions reliably.
