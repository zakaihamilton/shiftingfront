# Contributing to Shifting Front

Thank you for your interest in contributing to **Shifting Front**!

## Environment Prerequisites

- **Node.js**: `>=22.22.2` (use `nvm use 22.22.2` if installed via NVM)
- **Yarn**: `1.22.22`

## Development Workflow

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/zakaihamilton/shiftingfront.git
   cd shiftingfront
   yarn install --frozen-lockfile
   ```

2. Start the development server:

   ```bash
   yarn dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Quality Gates & Verification

Before submitting a Pull Request, ensure that all quality gates pass cleanly:

```bash
# Recommended local pre-push check (typecheck, lint, fast tests).
# verify:fast is not a substitute for health:invariants or health:balance
# when changing the commander, maps, or DEFAULT_BALANCE_THRESHOLDS.
yarn verify:fast

# Determinism & simulation invariants
yarn health:invariants

# Dead code analysis
yarn health:dead-code

# Markdown documentation linting
yarn health:documentation

# Dependency vulnerability audit
yarn health:audit

# Visual regression tests
yarn test:visual

# CI also runs yarn health:performance. Simulation p95 stays 25 ms; p99 is
# 25 ms locally and 40 ms on GitHub-hosted 2-vCPU runners after warmup.
yarn health:performance

# Full Next.js production build
yarn build
```

## Reporting issues

Use the GitHub issue templates. In-game crashes open a pre-filled crash report (seed, mission, version, diagnostics). Options and Credits open the bug/feedback form. Do not point players at a blank issue list.

When you change `DEFAULT_BALANCE_THRESHOLDS` or `APP_VERSION`, update `CHANGELOG.md` Unreleased and keep `APP_VERSION` equal to the `package.json` version. `tests/platform/docsDrift.test.ts` checks both.

## Pull Request Guidelines

- Keep changes focused and modular.
- Add or update unit tests in `tests/` for any new simulation mechanics, procedural generators, or UI components.
- Do not introduce external runtime dependencies unless discussed in an issue first (the runtime is intentionally lightweight: Next.js + React).
