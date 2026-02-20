# v1 Workplan (Ordered, Public-Ready)

This is the implementation order. Each phase has exit criteria and references acceptance tests.

## Phase 0: Repo + Release Hygiene (must be first)
Deliverables:
- Repo structure established (core/runtime/connectors/ui/knowledge)
- CI: lint + tests + secret scanning + dependency pinning checks
- Versioning conventions and schema registry file formats agreed

Exit criteria:
- `PLAN/v1_acceptance_tests.md` section A passes
- Release tags can be created without leaking secrets

## Phase 1: Workspace + Governance Core
Deliverables:
- Workspace model (`.cloned/`), tiers, policy packs
- Budgets model + enforcement hooks
- Approval queue model (append-only)
- Audit event model + redaction rules

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

Exit criteria:
- Acceptance tests D and E pass (capability reasoning, blueprint selection, onboarding plan)

## Phase 3: Vault Integration (BYOV Azure Key Vault + dev fallback)
Deliverables:
- Vault connector (MCP) with schemas and redaction rules
- Local dev vault provider (explicit dev-only) for contributors
- Secret classes and storage rules enforced

Exit criteria:
- Acceptance tests F pass (secrets stored and retrieved without leaks; vault unreachable behavior)

## Phase 4: Connector Runtime + Registry + Signing Verification
Deliverables:
- Local connector registry (`.cloned/registry.yaml`) and capability declarations
- Connector installer that verifies signatures (trust model)
- Runtime can load connectors, list tools, and enforce allowlists

Exit criteria:
- Acceptance tests G and H pass (install/verify/enable/disable connectors; schema validation)

## Phase 5: GitHub + YouTube Connectors (v1 initial set)

GitHub must implement the OAuth-bootstrap + GitHub App automation strategy (CONNECTORS/github_auth_strategy.md).
Deliverables:
- GitHub connector (MCP) using GitHub App installation tokens
- YouTube connector (OAuth installed-app) with assist-mode default
- Tool schemas versioned and pinned

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
- UI must be professional, intuitive, “hyperscaler-like” (see UX/command_center.md)

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
