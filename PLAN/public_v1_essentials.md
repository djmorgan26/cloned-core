# Public v1 Essentials (Must Ship)

This list defines “essentials” for a public release. None are deferred.

## Security & Governance
- Vault integration (BYOV) + dev fallback
- Budgets and approvals enforced for spend-like actions
- Audit logging with redaction
- Policy packs for Personal/Shared/Enterprise (enterprise pack can be limited but must exist)

## Onboarding
- Conversational onboarding (CLI mode acceptable)
- Blueprint selection and Plan of Record output
- Capability graph-driven connector recommendations
- Guided manual steps for identity providers

## Extensibility
- Connector registry
- Signed connector installation and verification
- Connector enable/disable per workspace
- Skill packs and constitutions with enforcement

## Observability & Control
- Command Center UI (local) with:
  - overview, connectors, runs, approvals, budgets, secrets health
- CLI parity for all critical actions

## First-value workflows
At least 3 blueprints:
- Creator (YouTube package generation)
- Researcher (deep research report with citations)
- Builder (app/repo scaffold plan with security basics)
