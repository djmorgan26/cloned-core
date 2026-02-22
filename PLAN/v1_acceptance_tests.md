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
- Egress allowlists enforced: connector/tool cannot reach non-allowlisted domains

## C1) Firewall UX + Policy Edits
- `cloned firewall list` shows the merged allowlists from built-in packs plus `.cloned/policy/<pack>.yaml` workspace overrides.
- `cloned firewall allow api.example.com --tool cloned.mcp.web.search@v1` writes to the workspace overlay, dedupes entries, and the new domain becomes active immediately.
- `cloned firewall remove api.example.com` updates the overlay and future runs block the host again.
- Programmatic edits via `cloned.internal.security.egress.update@v1` always create an approval request (per POLICY/packs) and apply only after approval; denial leaves the overlay untouched.

## C2) Local LLM + Prompt Guard
- With `docker/compose.local-llm.yaml` running and `LLM_API_BASE` pointed at loopback, `cloned.internal.synthesis@v1` resolves to the local endpoint and SafeFetch blocks attempts to reach non-allowlisted model hosts.
- When synthesis is given sources containing prompt-injection strings, the sanitized text from `guardUntrustedContent` (not the raw source) is sent to the model, flagged patterns are logged, and malicious instructions are ignored in the output.

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
- GitHub App install flow is guided and tokens are short-lived
- Repo operations work in least privilege mode (issue create / PR create)
How Verified:
- CLI device flow in `--dry-run` to show plan; then real install with test org (manual)
- API endpoints return installation IDs and permission snapshots

## J) YouTube Connector
- OAuth installed-app flow completes and token is stored in vault
- Assist-mode generates a package without uploading
- Publish requires explicit approval, and respects budgets/quotas
How Verified:
- CLI `cloned connect youtube --dry-run` shows scopes and approval gates; publish path requires approval

## K) Skills
- Skill runner enforces constitutions and tool allowlists
- Violations are blocked and logged with reasons
How Verified:
- Run a test skill that attempts a blocked tool; check audit and denial

## L) Pipelines + Artifacts
- Pipelines produce markdown artifacts + manifest with schema versions and provenance
- Artifacts are deterministic given the same inputs (to the extent possible)
How Verified:
- Re-run pipeline with same inputs; compare `artifact_manifest` hashes

## M) Command Center UI
- Shows: workspace status, budgets, connector status, runs, approvals, artifacts
- Provides safe controls (enable connector, run pipeline, approve/deny)
- Never shows secret values
How Verified:
- UI calls local API; spot-check responses do not include secrets; actions map to approvals
- UI requires paired device identity and allowed origin; unpaired or disallowed origin is rejected
- CSP and security headers present; no inline scripts

## N) Doctor + Hardening
- `cloned doctor` detects missing prereqs and provides fix steps
- State recovery works after crash (no corrupted approval/audit logs)
How Verified:
- Simulate crash during run; verify WAL recovery and intact audit chain hashes
- Attempt to bind non-loopback without auth -> rejected with clear error
- 10 consecutive bad auth attempts -> 429 with Retry-After
