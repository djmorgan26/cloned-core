---
title: "v1 Workplan (Ordered, Public-Ready)"
description: ""
audience: [admins, developers]
category: plan
---

# v1 Workplan (Ordered, Public-Ready)

Note: Security track updates and firewall/local‑LLM decisions are centralized in [v1-security-plan.md](v1-security-plan.md). This workplan remains for overall delivery sequencing and is complemented (not replaced) by the security plan.

This is the implementation order. Each phase has exit criteria and references acceptance tests.

## Sequencing guardrails and readiness signals
Multiple surfaces share the same contracts (schemas, DB tables, CLI/API shapes, UI). To avoid backtracking, use these guardrails:
- **Schema-first contracts.** Finalize JSON schemas under `schemas/` and the SQLite layout before writing connectors, skills, or UI flows that rely on them.
- **API + CLI before UI.** Document every route in `docs/api/openapi.yaml` and wire it through CLI workflows before building UI, SDKs, or external integrations. UI work only starts when API responses are stable.
- **Governance/vault ahead of connectors.** Egress policy, approvals, and vault enforcement must exist before adding connectors or skills so that security posture never regresses.
- **Acceptance tests as go/no-go gates.** Do not advance until the row’s acceptance sections are automated and green; they are the "move on" signal.

| Phase | Start when… | Why this order | Move on when… |
| --- | --- | --- | --- |
| 0 – Repo + Release Hygiene | Repo skeleton + CI runners exist; stack choices + directories set (`src/`, `ui/`, `schemas/`, `docs/`). | Establishes a predictable tree for every later phase and guarantees CI + secret scanning are already catching regressions. | Acceptance tests A pass and release tags can be created without exposing secrets. |
| 1 – Workspace + Governance Core | Phase 0 exit criteria met; base workspace + policy schemas drafted (`schemas/workspace.schema.json`, `policy/packs/*`). | Budgets, approvals, and audit models are the foundation for capability and connector work. | Acceptance tests B & C pass; CLI `cloned init`/`cloned approvals` flows are scriptable; schema docs frozen for this release. |
| 2 – Capability Graph + Blueprint Engine | Workspace/governance data is stable; `src/capability/*` + `blueprints/` scaffolds exist; CLI `cloned onboard --dry-run` prints collected goals. | Blueprint scoring and graph traversal need the same policy + budget definitions to reason about available capabilities. | Acceptance tests D & E pass; onboarding produces a Plan of Record artifact; docs/api includes onboarding + capability surfaces. |
| 3 – Vault Integration | Blueprint engine identifies which secrets are required; dev vault provider exists for contributors. | Connectors/skills consume secrets; capturing the contract before runtime work prevents rework. | Acceptance tests F pass; `cloned vault status` is reliable; Azure BYOV doc + tests explain switchover. |
| 4 – Connector Runtime + Registry | Vault contract + policy enforcement are solid; docs/api/openapi.yaml already covers workspace/governance/vault routes. | Runtime, registry, and signing rely on secrets, trust stores, and allowlists being finalized. | Acceptance tests G & H pass; registry YAML flow works end-to-end; connectors can be listed/enforced via CLI/API. |
| 5 – GitHub + YouTube Connectors | Runtime loader, SafeFetch, and signing verification are stable; CLI `cloned connect` writes state; `.cloned/registry.yaml` contains sample entries. | Real connectors should not lead runtime changes; they prove the platform contract. | Acceptance tests I & J pass; connectors publish tool schemas; tokens live in vault with approvals/budgets enforced. |
| 6 – Skill Runtime + Pipelines | Connectors supply the needed capabilities; artifact schema + runner APIs exist; `/runs` API started. | Pipelines and skill packs depend on tool availability and governance hooks to block violations. | Acceptance tests K & L pass; `cloned run pipeline.research.report` and builder/creator flows output manifests deterministically. |
| 7 – Command Center UI | Workspace/approvals/runs/connectors/budgets/vault APIs are implemented + documented; CLI workflows are stable; data exists to render (audit rows, run logs, connector states). | UI consumes the API; building it earlier would duplicate business logic or require breaking changes (API-before-frontend guardrail). | Acceptance tests M pass; UI only calls documented endpoints; device pairing enforced; no mocks needed. |
| 8 – Public Release Hardening | All functional phases are complete; docs + API schemas versioned; telemetry/logging in place. | Hardening needs a full system to validate doctor checks, crash recovery, and threat model. | Acceptance tests N pass; `cloned doctor` catches misconfigurations; release artifacts/changelog ready. |

## Phase 0: Repo + Release Hygiene (must be first)
Deliverables:
- Repo structure established (core/runtime/connectors/ui/knowledge)
- CI: lint + tests + secret scanning + dependency pinning checks
- Versioning conventions and schema registry file formats agreed
 - Stack choices locked (see [docs/architecture/stack-choices.md](../architecture/stack-choices.md))
 - Repo plan published (see [docs/repos/repo-plan.md](../repos/repo-plan.md))

Exit criteria:
- `[v1-acceptance-tests.md](v1-acceptance-tests.md)` section A passes
- Release tags can be created without leaking secrets

## Phase 1: Workspace + Governance Core
Deliverables:
- Workspace model (`.cloned/`), tiers, policy packs
- Budgets model + enforcement hooks
- Approval queue model (append-only)
- Audit event model + redaction rules
- Schemas added under `schemas/` (workspace, policy, registry, audit)
- Security posture baseline: loopback bind default, device pairing for UI, auth rate limiting

Exit criteria:
- Acceptance tests B and C pass (workspace creation, policy application, approvals, audit)

## Phase 2: Capability Graph + Blueprint Engine
Deliverables:
- Capability graph data model (nodes/edges, capability taxonomy)
- Blueprint schema + selection engine
- Onboarding agent (CLI conversational) that:
  - gathers goals/constraints
  - selects blueprint(s)
  - produces Plan of Record
  - executes allowed setup steps
- Initial blueprints added under `blueprints/`
- Base OpenAPI coverage for workspace + onboarding routes in `docs/api/openapi.yaml` so CLI and future UI consumers share the exact contract

Exit criteria:
- Acceptance tests D and E pass (capability reasoning, blueprint selection, onboarding plan)

## Phase 3: Vault Integration (BYOV Azure Key Vault + dev fallback)
Deliverables:
- Vault connector (MCP) with schemas and redaction rules
- Local dev vault provider (explicit dev-only) for contributors
- Secret classes and storage rules enforced
 - Vault provider contract documented

Exit criteria:
- Acceptance tests F pass (secrets stored and retrieved without leaks; vault unreachable behavior)

## Phase 4: Connector Runtime + Registry + Signing Verification
Deliverables:
- Local connector registry (`.cloned/registry.yaml`) and capability declarations
- Connector installer that verifies signatures (trust model)
- Runtime can load connectors, list tools, and enforce allowlists
- MCP connector contract documented ([docs/connectors/mcp-contract.md](../connectors/mcp-contract.md))
- Trust store structure defined ([docs/trust/structure.md](../trust/structure.md))
- Connectors/registry/runs endpoints implemented in Fastify and documented in `docs/api/openapi.yaml`, keeping CLI/API/UI in sync
- Egress allowlists enforced per policy; connectors declare outbound hosts

Exit criteria:
- Acceptance tests G and H pass (install/verify/enable/disable connectors; schema validation)

## Phase 5: GitHub + YouTube Connectors (v1 initial set)

GitHub must implement the OAuth-bootstrap + GitHub App automation strategy ([docs/connectors/github-auth-strategy.md](../connectors/github-auth-strategy.md)).
Deliverables:
- GitHub connector (MCP) using GitHub App installation tokens
- YouTube connector (OAuth installed-app) with assist-mode default
- Tool schemas versioned and pinned
 - GitHub permissions documented; YouTube scopes documented

Exit criteria:
- Acceptance tests I and J pass (GitHub actions; YouTube auth and package/publish gating)

## Phase 6: Skill Runtime + Skill Packs + Pipelines
Deliverables:
- Skill runner that enforces constitutions and tool allowlists
- At least 3 skill packs:
  1) Research (deep research + citations)
  2) Builder (repo/app scaffolding plan + security basics)
  3) Creator (YouTube package generation)
- Pipeline engine that produces artifacts and manifests
 - Artifact manifest schema added

Exit criteria:
- Acceptance tests K and L pass (skills run, artifacts created with provenance, policy enforced)

## Phase 7: Command Center UI (public v1 essential)
Deliverables:
- Local web UI served by cloned-core (or cloned-ui) with:
  - Workspace overview (budgets, policy pack, connector status)
  - Runs view (what is happening now, logs, artifacts)
  - Approvals view (pending/decided)
  - Connectors view (installed, versions, signatures, capabilities)
  - Secrets status view (no values shown; just health and references)
  - Firewall + policy overrides view (read-only defaults, workspace overlay diff, approval-gated change requests)
- UI must be professional, intuitive, “hyperscaler-like” (see [docs/ux/command-center.md](../ux/command-center.md))
 - Local API OpenAPI spec (docs/api/openapi.yaml) is complete, versioned, and used to generate the UI client (no ad-hoc fetches)

Exit criteria:
- Acceptance tests M pass (UI shows real state; no secrets; controls enforce approvals)

## Phase 8: Public Release Hardening
Deliverables:
- `cloned doctor` environment checks + repair suggestions
- Crash-safe logging and state recovery
- Threat model review + documented security posture
- Documentation: onboarding, blueprints, connector dev guide, marketplace trust model

Exit criteria:
- Acceptance tests N pass (doctor checks; reproducibility; minimal friction for new users)

## Release target
v1 ships once all phases exit criteria pass. Features may be marked beta, but essentials must function end-to-end.
