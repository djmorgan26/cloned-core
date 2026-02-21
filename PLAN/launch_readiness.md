# Cloned – Launch Readiness Plan
> From current state → first real users

Generated: 2026-02-21
Branch: `claude/fix-gitleaks-ci-launch-plan-ZxbB4`

---

## What Exists Today (Honest Audit)

### Fully Built and Working
- **Workspace init** (`cloned init`) – creates `.cloned/` directory structure, SQLite DB, audit log, registry YAML, budget seeding
- **Governance core** – budget enforcement with rolling windows per tier (personal/shared/enterprise), approval queue (append-only), policy packs
- **Audit log** – chain-hash tamper detection, redaction (no raw secrets in logs), well-tested
- **Egress enforcement** – default-deny outbound with wildcard/exact domain allowlists, per-tool and per-connector lists
- **Connector registry + signing** – install/verify/enable/disable flow with trust roots, signature verification, manifest validation
- **Fastify API server** – 8 route groups (workspace, connectors, approvals, runs, budgets, vault, doctor, pairings), loopback-bind default, rate limiting, security headers, strict CSP
- **CLI skeleton** – all 8 planned commands registered (`init`, `onboard`, `connect`, `run`, `approvals`, `vault`, `doctor`, `serve`)
- **Runtime runner** – pipeline execution engine with per-step budget checks, approval gating, audit writes, dry-run mode
- **Skill packs (pipelines defined)** – researcher, builder, creator pipeline configs in `src/runtime/skills/`
- **Command Center UI** – React/Vite SPA with 8 pages (Overview, Connectors, Approvals, Runs, Budgets, Secrets, Pairings, Doctor), Sidebar nav, API client hooks
- **Schemas** – 9 JSON schemas under `SCHEMAS/` (workspace, policy, registry, audit, blueprint, capability, connector manifest, artifact manifest, tool)
- **Blueprints** – 4 YAML files (researcher, builder, creator, legal_research)
- **CI** – lint + typecheck + tests + schema validation + gitleaks (just fixed)
- **SQLite schema** – defined in `STATE/sqlite_schema.sql`
- **Dev vault provider** – file-based local dev secret storage
- **GitHub connector auth module** – full OAuth device flow + GitHub App installation token state machine code
- **YouTube connector auth module** – device OAuth flow code

### Scaffolded / Partially Implemented
- **`cloned onboard`** – command exists; conversational blueprint selection flow needs real prompts wired to capability graph
- **`cloned connect`** – command exists; GitHub and YouTube have auth modules but the CLI command doesn't complete the full flow (token storage to vault, state persistence to DB)
- **`cloned run`** – command exists; pipeline runner is implemented but tool handlers are not registered (no real tool implementations behind `cloned.mcp.web.search@v1`, `cloned.internal.synthesis@v1`, etc.)
- **`cloned vault`** – command exists; dev provider works; Azure Key Vault provider dynamically imported but `@azure/keyvault-secrets` and `@azure/identity` are not in `package.json`
- **`cloned doctor`** – command exists; doctor route registered; actual check implementations need to be fleshed out
- **Device pairing** – pairing route registered and UI page exists; the pairing enforcement middleware is not wired into the API (requests aren't actually rejected for unpaired devices)
- **Capability graph** – schema exists; `src/capability/` module exists; the runtime graph traversal for blueprint recommendation is not connected to onboard flow
- **UI** – all pages exist and make API calls; no visual polish, no loading/error states, no auth (device pairing) enforcement in the UI

### Not Yet Started
- **Real tool implementations** – the pipeline runner registers tool handlers, but no actual handlers are wired up (web search, GitHub issue create/PR create, YouTube upload, synthesis)
- **Azure Key Vault integration** – dynamic import path exists but the azure packages are absent
- **GitHub App server-side** – installation token exchange, webhook handling, and App credential storage need implementation
- **YouTube publish flow** – the assist-mode pipeline and the approval-gated publish path are defined but not implemented end-to-end
- **`cloned doctor` checks** – the spec in `DOCTOR/doctor_checks.md` defines prereq checks; these need to actually run (Node version, SQLite, vault reachability, etc.)
- **Crash recovery testing** – WAL recovery and audit chain integrity on restart
- **Submodule repos** – `DIRECTIONS.md` calls for cloned-runtime, cloned-connectors, cloned-knowledge as separate repos; these do not exist; everything lives in cloned-core for now
- **Documentation for external users** – no onboarding guide, no connector dev guide, no user-facing README
- **Marketplace** – signing trust model is specced; no publisher verification flow, no install UX

---

## Gap vs. v1 Acceptance Tests

| Test | Status | Blocking? |
|------|--------|-----------|
| A: CI hygiene (lint, tests, secret scan) | ✅ Done (just fixed gitleaks) | — |
| B: `cloned init` creates workspace | ✅ Implemented | — |
| C: Budgets enforced, approvals queue, audit chain, egress allowlists | ✅ Core logic done; egress not enforced at HTTP layer yet | Partial |
| D: Capability graph goal→capability mapping | ⚠️ Schema + module stub; traversal not wired | Yes |
| E: Blueprint selection + Plan of Record output | ⚠️ Blueprints exist; onboard flow incomplete | Yes |
| F: Vault (Azure BYOV + dev fallback) | ⚠️ Dev works; Azure deps missing | Yes |
| G: Connector signing/install/reject | ✅ Implemented | — |
| H: Connector runtime tool schema exposure | ⚠️ Registry works; tool schema serving not wired | Yes |
| I: GitHub connector state machine | ⚠️ Auth code exists; CLI flow incomplete, token not persisted | Yes |
| J: YouTube connector | ⚠️ Auth code exists; assist-mode + approval gate not end-to-end | Yes |
| K: Skills (constitution enforcement, violation audit) | ⚠️ Runner has gating; no real tools behind steps | Yes |
| L: Pipelines + artifact provenance | ⚠️ Runner works; no real artifact output | Yes |
| M: Command Center UI (real state, no secrets, pairing enforced) | ⚠️ UI exists; pairing not enforced; no real tool data | Yes |
| N: Doctor checks + hardening | ⚠️ Command exists; checks not implemented | Yes |

---

## The Ordered Plan to Ship

### Step 1 – Wire Egress to HTTP (1–2 days)
The egress enforcement logic (`src/runtime/egress.ts`) is excellent but is only called inside the runner. Any HTTP fetch a connector makes bypasses it entirely.

**Tasks:**
- Add an HTTP proxy/interceptor that routes connector outbound requests through `checkEgress()`
- This can be as simple as a fetch wrapper that all connector tool handlers must use
- Write a test: connector attempts call to non-allowlisted domain → blocked and audited

**Why first:** Security baseline. Everything downstream builds on "connectors cannot call arbitrary URLs."

---

### Step 2 – Wire Device Pairing Enforcement (1 day)
The pairing route exists, the UI page exists, but nothing actually checks whether a device is paired before granting API access.

**Tasks:**
- Add Fastify preHandler middleware that checks `X-Device-Id` header against the `pairings` table in SQLite
- Reject unpaired requests with 401 + clear message
- UI: send stored device ID with every request; if rejected, redirect to pairing flow

**Why second:** Without this, the "loopback security" story is hollow.

---

### Step 3 – Implement `cloned connect github` End-to-End (2–3 days)
The state machine and device flow code exist. Need to close the loop.

**Tasks:**
- `cloned connect github`: run device flow → poll for token → store token in vault → persist state to DB (`github_auth_state` table or workspace config)
- Implement `getInstallationToken(installationId)` using stored App credentials
- Wire GitHub App installation guide to CLI (`cloned connect github --install-app`)
- Register GitHub tool handlers (`github.issue.create@v1`, `github.pr.create@v1`) backed by real GitHub API calls using installation tokens
- Acceptance test: `cloned connect github --dry-run` shows plan; real flow transitions state machine to AppActive

---

### Step 4 – Implement `cloned onboard` Properly (2 days)
Capability graph traversal + blueprint selection + Plan of Record.

**Tasks:**
- Load `BLUEPRINTS/*.yaml` files and validate against `SCHEMAS/blueprint.schema.json`
- Implement graph traversal in `src/capability/`: given a goal string, return required capabilities
- Wire to `cloned onboard`: ask 3–5 questions (goal, constraints, connectors available) → select blueprint → output Plan of Record markdown to `.cloned/plans/`
- Capability graph should surface which connectors are missing and prompt `cloned connect <connector>`

---

### Step 5 – Implement `cloned doctor` Checks (1 day)
Per `DOCTOR/doctor_checks.md`.

**Tasks:**
- Node.js version >= 20
- SQLite DB exists and WAL mode confirmed
- `.cloned/` directory permissions (700)
- Vault reachability (dev: file exists; azure: can list secrets)
- Connector signature trust roots present
- API server health endpoint reachable
- Print actionable fix steps for each failing check

---

### Step 6 – Real Tool Handlers for Researcher Pipeline (2–3 days)
At least one end-to-end pipeline must actually run. Researcher is the lowest-risk (no external writes, no publish).

**Tasks:**
- `cloned.mcp.web.search@v1`: implement using a configurable search provider (DuckDuckGo API or similar, no key required for basic search)
- `cloned.internal.synthesis@v1`: call a configured LLM (user provides key via vault; model is configurable). This is where the actual "agent" call happens
- `cloned.internal.artifact.save@v1`: write markdown to `.cloned/artifacts/` with manifest JSON
- `cloned run researcher --topic "..."` should produce a real markdown report

---

### Step 7 – Azure Key Vault Provider (1–2 days)
The dynamic import path is ready; just need the packages and proper credential handling.

**Tasks:**
- Add `@azure/keyvault-secrets` and `@azure/identity` to `package.json` (optional peer dependency or separate install step)
- Complete `AzureKeyVaultProvider` in `src/vault/azure-provider.ts`
- `cloned vault set --provider azure` switches provider
- Test: secret written to Azure KV, reference stored in workspace config, value never logged

---

### Step 8 – UI Polish + Real Data (2 days)
The UI structure is correct. It needs to actually show meaningful state.

**Tasks:**
- Add loading spinners and error states to all `useApi()` calls (currently they render nothing on error)
- Overview page: show real budget consumption percentages with a visual bar
- Runs page: stream log lines if run is in-progress (Server-Sent Events or polling)
- Connectors page: show connector tool list when expanded
- Add device pairing flow to UI (first-run: shows pairing code; subsequent: sends X-Device-Id)
- Ensure no secret values are ever returned by any API endpoint (audit the vault route)

---

### Step 9 – YouTube Connector + Creator Pipeline (2–3 days)
**Tasks:**
- `cloned connect youtube`: device OAuth flow → token to vault → state to DB
- `cloned run creator`: generate video script/description/tags → save as artifact (assist mode, no upload)
- YouTube upload path: requires explicit approval in queue; `cloned approvals list` + `cloned approvals approve <id>` then triggers upload

---

### Step 10 – Documentation + `cloned init` Happy Path (2 days)
**Tasks:**
- User-facing `GETTING_STARTED.md`: install Node 20, `npm install`, `cloned init`, `cloned doctor`, `cloned onboard`, `cloned run researcher`
- Connector dev guide: how to write a manifest, how to sign, how to submit to registry
- Update `README.md` to be a user README (not a spec handoff document)
- Record a short screen recording or animated GIF of the happy path

---

### Step 11 – Hardening + Release Tag (1–2 days)
**Tasks:**
- Crash recovery: test WAL recovery after simulated crash; verify audit chain integrity on restart
- Non-loopback bind attempt → clear rejection with guidance
- 10 consecutive bad auth attempts → 429 Retry-After
- Pin all CI action SHA hashes (not just tag versions)
- Create `v0.1.0` release tag on `main` with a changelog entry

---

## Priority Order Summary

```
1. Egress → HTTP enforcement
2. Device pairing enforcement
3. cloned connect github (end-to-end)
4. cloned onboard (capability graph + blueprint selection)
5. cloned doctor (real checks)
6. Researcher pipeline runs for real
7. Azure KV vault
8. UI polish + real data
9. YouTube connector + creator pipeline
10. Docs + happy path README
11. Hardening + v0.1.0 release tag
```

Steps 1–6 are the **minimum viable bar** for putting this in anyone's hands and having it mean something. Steps 7–11 are needed for a credible public v1.

---

## What to Tell Early Users (Beta Framing)

Before step 11, frame it as a **closed beta / contributor preview**:
- Invite 3–5 people who understand the space (agent tooling, security-conscious devs)
- Give them a specific task: run the researcher pipeline on a topic they care about
- They will hit gaps — that's the point; their friction is the spec for steps 7–11
- Gate on: `cloned doctor` passes, `cloned run researcher` produces output, pairing works

---

## What Is NOT in v1 Scope
- Submodule repo split (cloned-runtime, cloned-connectors, etc.) — stay monorepo for now; split later
- Marketplace publisher verification — specced but deferred to 3–6 month horizon
- Enterprise SSO/SAML — deferred
- Cloud sync of any kind — local-first means local for v1
- Managed vaults (non-BYOV) — deferred
