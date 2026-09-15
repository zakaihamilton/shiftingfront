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
# Recommended local pre-push check (typecheck, lint, fast tests)
yarn verify:fast

# Determinism & simulation invariants
yarn health:invariants

# Dead code analysis
yarn health:dead-code

# Markdown documentation linting
yarn health:documentation

# Full Next.js production build
yarn build
```

## Pull Request Guidelines

- Keep changes focused and modular.
- Add or update unit tests in `tests/` for any new simulation mechanics, procedural generators, or UI components.
- Do not introduce external runtime dependencies unless discussed in an issue first (the runtime is intentionally lightweight: Next.js + React).
