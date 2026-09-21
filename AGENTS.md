<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Shifting Front is a single, fully client-side Next.js 16 + React 19 browser RTS game (Canvas 2D). There is no backend service, database, or environment variables to configure — all campaign content is generated deterministically from a 4-digit seed and persisted to `localStorage`. See `README.md` for the full command list and game details.

When adding or modifying units, always read and follow
[`docs/adding-new-units.md`](docs/adding-new-units.md) before making changes.

Yarn 1.22.22 is preinstalled. `jsdom@30` requires Node `^22.22.2`; nvm provides it at `$HOME/.nvm/versions/node/v22.22.2`. If `node -v` is older (the default PATH can expose 22.14.0 first), prepend that nvm bin directory before any `yarn` command.

Environment install is `yarn install --frozen-lockfile` plus `yarn playwright install --with-deps chromium`. Start launches `yarn dev --hostname 0.0.0.0 --port 3000`; do not reinstall dependencies in start.

Standard commands (defined in `package.json`, don't duplicate — reference there):

- `yarn dev` — Next.js dev server on port 3000 (this is the app; run it to test the UI).
- `yarn test` — Vitest unit suite, headless, no browser needed (hundreds of tests; check the run output for the current count).
- `yarn build` — production build.
- `yarn test:e2e` — Playwright. Its `webServer` runs `yarn build && PORT=3100 ... yarn start`, so it builds and serves its own production server on port 3100 (independent of the port-3000 dev server); it needs the Chromium installed during environment install.
- `yarn inspect <seed>` / `yarn sim --seed <seed> --mission <n> --ticks <n>` — headless CLIs via `tsx`.

Non-obvious caveats:

- `yarn lint` is clean on a checkout.
- Welcome **TUTORIAL** opens `/tutorial` on seed `0000` with no time limit. Briefing/play smoke tests in `tests/e2e/smoke.spec.ts` launch a campaign from New Game → briefing; a separate smoke case covers menu → **TUTORIAL** → Exit Training → menu.
- To manually reach the battlefield: New Game → enter a seed (or use ROLL) → Launch → briefing → Launch. The seed field is split into individual digit inputs, so ROLL is the most reliable way to seed it in automated/browser testing.
- Open the Cloud Agent browser at `http://localhost:3000` (not `http://127.0.0.1:3000`). Next.js HMR origin checks can leave 127.0.0.1 unhydrated.
