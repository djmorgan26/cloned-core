# v1 Acceptance Tests (Verifiable)

## A) Repo/CI Hygiene
- CI runs on PR and on main: lint + unit tests + schema checks
- Secret scanning is enabled and blocks merges when findings exist
- Version tags can be generated for each module

## B) Workspace
- `cloned init --type personal` creates `.cloned/` structure with config, state.db, audit.log, registry.yaml
- Policy pack is applied and visible

## C) Governance
- Budgets are enforced (tool call with cost metadata is blocked above cap)
- Approvals queue records pending decisions and finalized decisions (append-only)
- Audit logs include tool_id/version, hashes, timestamps; no secrets

## D) Capability Graph
- A goal maps to required capabilities via the graph
- Missing capabilities are detected and produce actionable recommendations

## E) Blueprint Selection
- Onboarding can select a blueprint based on user goal + constraints
- Onboarding produces a Plan of Record in markdown

## F) Vault
- Secrets are written to Azure Key Vault (BYOV) and referenced in workspace state
- Local dev vault can be used without changing code (provider switch)
- No secret values appear in logs or UI

## G) Registry + Signing
- Connector install requires signature verification
- Unsigned or tampered connectors are rejected
- Trust roots are configurable per workspace

## H) Connector Runtime
- Enabled connectors expose tool schemas to runtime
- Tool allowlists are enforced by policy packs and constitutions

## I) GitHub Connector
- `cloned connect github` produces state transitions: Unauthed -> UserAuthed (OAuth) -> AppInstalled -> AppActive
- After AppActive, routine operations do not require a user OAuth session

## I) GitHub Connector
- GitHub App install flow is guided and tokens are short-lived
- Repo operations work in least privilege mode (issue create / PR create)

## J) YouTube Connector
- OAuth installed-app flow completes and token is stored in vault
- Assist-mode generates a package without uploading
- Publish requires explicit approval, and respects budgets/quotas

## K) Skills
- Skill runner enforces constitutions and tool allowlists
- Violations are blocked and logged with reasons

## L) Pipelines + Artifacts
- Pipelines produce markdown artifacts + manifest with schema versions and provenance
- Artifacts are deterministic given the same inputs (to the extent possible)

## M) Command Center UI
- Shows: workspace status, budgets, connector status, runs, approvals, artifacts
- Provides safe controls (enable connector, run pipeline, approve/deny)
- Never shows secret values

## N) Doctor + Hardening
- `cloned doctor` detects missing prereqs and provides fix steps
- State recovery works after crash (no corrupted approval/audit logs)
