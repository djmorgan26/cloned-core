# Repository Guidelines

## Project Structure & Module Organization
- Core TypeScript in `src/` (ESM, Node 20+): `cli/`, `api/`, `runtime/`, `governance/`, `audit/`, `vault/`, `connector/`, `capability/`, `blueprint/`, `workspace/`.
- Tests in `src/__tests__/` as `*.test.ts`.
- UI (React + Vite) in `ui/`.
- Schemas in `schemas/`, blueprints in `blueprints/`, policies in `policy/`.
- Plans and acceptance criteria in `docs/plan/v1-acceptance-tests.md`.

## Build, Test, and Development Commands
- Install deps: `npm install`
- Build TS: `npm run build` (watch: `npm run build:watch`)
- Typecheck: `npm run typecheck`
- Lint/fix: `npm run lint` | `npm run lint:fix`
- Unit tests: `npm test` (CI: `npm run test:ci` collects coverage)
- API server: `npm start` (serves Fastify API)
- CLI (after build): `npm run cli -- <cmd>` e.g., `npm run cli -- run pipeline.research.report --dry-run`
- Validate schemas: `npm run schema:validate`
- UI dev (from `ui/`): `npm run dev`

## Coding Style & Naming Conventions
- TypeScript strict mode; ESM (`NodeNext`).
- 2-space indentation; `camelCase` variables/functions, `PascalCase` classes, `kebab-case` filenames.
- ESLint (`@typescript-eslint`) enforces style; prefix unused args with `_` to satisfy `no-unused-vars` rule.

## Testing Guidelines
- Framework: Jest (`ts-jest` ESM). Place tests under `src/__tests__/` and name `*.test.ts`.
- Prefer unit tests near modules; mock egress and vault interactions.
- CI runs lint, typecheck, tests, and schema/YAML validation.

## Commit & Pull Request Guidelines
- Use clear, scoped commits; Conventional Commits are preferred (e.g., `feat:`, `fix:`, `docs:`).
- PRs should include: concise description, linked issues, test coverage for changes, and UI screenshots when touching `ui/`.
- All PRs must pass CI and keep secrets out of git (Gitleaks runs in CI).

## Security & Configuration
- No secrets in git or logs; use the Vault APIs (`src/vault/*`) and `src/shared/redact.ts`.
- Cost-incurring actions require explicit approval; provide `--dry-run` for all new commands and connectors.
- Validate changes against `docs/plan/v1-acceptance-tests.md` before merging.

## Planning Docs Index
- All planning and status documents live under `docs/plan/`. Start at `docs/plan/README.md` for an index and current status.
