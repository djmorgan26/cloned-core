---
title: "Cloned – Launch Readiness Plan"
description: ""
audience: [admins, developers]
category: plan
---

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
- **Schemas** – 9 JSON schemas under `schemas/` (workspace, policy, registry, audit, blueprint, capability, connector manifest, artifact manifest, tool)
- **Blueprints** – 4 YAML files (researcher, builder, creator, legal_research)
- **CI** – lint + typecheck + tests + schema validation + gitleaks (just fixed)
- **SQLite schema** – defined in `state/sqlite_schema.sql`
- **Dev vault provider** – file-based local dev secret storage
- **GitHub connector auth module** – full OAuth device flow + GitHub App installation token state machine code
- **YouTube connector auth module** – device OAuth flow code

### Scaffolded / Partially Implemented
- **`cloned onboard`** – command exists; conversational blueprint selection flow still needs prompts wired into the capability graph traversal
- **`cloned connect`** – GitHub/YouTube device flows run today and tokens are stored in the vault, but the CLI never records connector state in SQLite or completes the install state machine
- **`cloned run`** – the researcher pipeline runs end-to-end (web search + synthesis + artifact save) once an LLM key is present, while builder/creator pipelines still reference future tools
- **`cloned vault`** – dev provider works and the Azure Key Vault provider ships with optional dependencies, but we still need docs/tests for BYO vault configuration
- **`cloned doctor`** – CLI surfaces the implemented checks (Node version, WAL mode, vault, allowlists, etc.); deeper networking/doctor-plan checks remain TODO
- **Device pairing** – pairing route registered and UI page exists; the enforcement middleware is not wired into the API (requests aren't actually rejected for unpaired devices)
- **Capability graph** – schema exists; `src/capability/` module exists; the runtime graph traversal for blueprint recommendation is not connected to onboard flow
- **UI** – all pages exist and make API calls; no visual polish, no loading/error states, no auth (device pairing) enforcement in the UI

### Not Yet Started
- **GitHub App server-side** – installation token exchange, webhook handling, and App credential storage need implementation
- **YouTube publish flow** – the assist-mode pipeline and the approval-gated publish path are defined but not implemented end-to-end
- **Crash recovery testing** – WAL recovery and audit chain integrity on restart
- **Submodule repos** – `directions.md` calls for cloned-runtime, cloned-connectors, cloned-knowledge as separate repos; these do not exist; everything lives in cloned-core for now
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
| F: Vault (Azure BYOV + dev fallback) | ⚠️ Dev + Azure providers implemented; needs docs/tests | Partial |
| G: Connector signing/install/reject | ✅ Implemented | — |
| H: Connector runtime tool schema exposure | ⚠️ Registry works; tool schema serving not wired | Yes |
| I: GitHub connector state machine | ⚠️ Auth code exists; CLI flow incomplete, token not persisted | Yes |
| J: YouTube connector | ⚠️ Auth code exists; assist-mode + approval gate not end-to-end | Yes |
| K: Skills (constitution enforcement, violation audit) | ⚠️ Researcher tools wired (search, synth, artifact); creator/builder still stubbed | Partial |
| L: Pipelines + artifact provenance | ⚠️ Researcher pipeline produces markdown artifacts; creator/builder pending | Partial |
| M: Command Center UI (real state, no secrets, pairing enforced) | ⚠️ UI exists; pairing not enforced; no real tool data | Yes |
| N: Doctor checks + hardening | ⚠️ Baseline checks implemented; need container/ports coverage | Partial |

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

### Step 3 – Complete `cloned connect github` State + Installation Flow (2–3 days)
Device flows already issue tokens and stash them in the vault; CLI support for installation IDs/App creds now exists. Remaining work: surface this in the UI and tighten docs/tests.

**Tasks:**
- ✅ Persist connector state in SQLite (device auth → installation selected → AppActive) and expose helper APIs (`connector_state` table).
- ✅ Add `cloned connect github --complete-install ...` so the CLI can capture installation IDs + permissions when the user finishes the GitHub App flow.
- ✅ Exchange stored App credentials for short-lived installation tokens and prefer them inside GitHub tool handlers; fallback to OAuth only if the install token fetch fails.
- ⚠️ UI: mirror the new CLI flow – once the user installs the App, show the installation ID + prompt for PEM upload, then call the same completion path.
- ⚠️ Acceptance test/docs: scripted test (or smoke script) proving `cloned connect github` transitions through UserAuthed/AppInstalled/AppActive with DB rows plus audit entries; document the GitHub settings locations for installation IDs + private keys (see `docs/connectors/github-auth-strategy.md`).

---

### Step 4 – Implement `cloned onboard` Properly (2 days)
Capability graph traversal + blueprint selection + Plan of Record.

**Tasks:**
- Load `blueprints/*.yaml` files and validate against `schemas/blueprint.schema.json`
- Implement graph traversal in `src/capability/`: given a goal string, return required capabilities
- Wire to `cloned onboard`: ask 3–5 questions (goal, constraints, connectors available) → select blueprint → output Plan of Record markdown to `.cloned/plans/`
- Capability graph should surface which connectors are missing and prompt `cloned connect <connector>`

---

### Step 5 – Extend `cloned doctor` Coverage (1 day)
Baseline checks (Node version, WAL mode, vault, registry, API bind) already run; now add the container + network guardrails described in `[docs/doctor/doctor-checks.md](../doctor/doctor-checks.md)`.

**Tasks:**
- Verify Docker is installed and meets the sandbox requirements (rootless, version, compose file knobs)
- Check `.cloned/trust` contents for connector signing roots + schema integrity
- Call the API health endpoint through the configured host/port and fail if it cannot be reached
- Add an opt-in `doctor ports` subcommand that inspects active sockets vs. the port governance plan (even if it only warns for now)

---

### Step 6 – Researcher Pipeline QA + Demo (2 days)
Search, synthesis, and artifact-save tools exist; now prove the path is stable.

**Tasks:**
- Add an integration test (or scripted smoke test) that registers the built-in tools, runs `pipeline.research.report` with mocked fetch/LLM responses, and asserts that an artifact manifest + file are written
- Document the LocalAI Docker flow + required vault keys in `getting-started.md`, linking to it from the README quick start
- Capture a sample markdown artifact (or screenshot) to reference in docs + onboarding so users know what "success" looks like

---

### Step 7 – Azure Key Vault BYOV Hardening (1–2 days)
The provider + optional dependencies are in place; we still need docs/test coverage so BYOV users can rely on it.

**Tasks:**
- ✅ CLI exposes `cloned vault status`, `cloned vault provider`, and `cloned vault bootstrap azure` so users (and AI assistants) can generate step-by-step Azure scripts and verify connectivity (`getting-started.md` now includes the recipe).
- ✅ `cloned setup` wizard chains workspace init → doctor → Azure onboarding with per-step resume (UI must expose the same steps for parity).
- Add README + doctor guidance for configuring `AZURE_KEYVAULT_URI`/DefaultAzureCredential and switching providers via `cloned vault`
- Write a Jest smoke test that mocks the Azure SDK client and asserts that `AzureKeyVaultProvider` maps dotted keys to hyphenated names + handles SecretNotFound
- Monitor the new CLI sanity check (`cloned vault status`) in docs/doctor output and add automated coverage if regressions appear

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
- Persist YouTube connector state (assist vs. publish mode, channel selection) to SQLite instead of keeping it implicit
- `cloned run pipeline.creator.youtube`: reuse the existing research + video package steps, emit artifacts, and surface pending approvals when uploads are requested
- Wire the approval gate so that a publish attempt creates an approval record and, once approved, the upload tool runs with real HTTP calls (still sandboxed/proxied)

---

### Step 10 – Documentation + `cloned init` Happy Path (2 days)
**Tasks:**
- User-facing `getting-started.md`: install Node 20, `npm install`, `cloned init`, `cloned doctor`, `cloned onboard`, `cloned run researcher`
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
3. cloned connect github (state + installation)
4. cloned onboard (capability graph + blueprint selection)
5. cloned doctor (container/network coverage)
6. Researcher pipeline QA + demo assets
7. Azure KV BYOV hardening
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
