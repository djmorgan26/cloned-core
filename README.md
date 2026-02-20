# Cloned - Spec Pack v0.3 (Public v1 Essentials Included)

This is a **spec-first** package to hand to coding agents (Claude Code, Codex). It defines a **public-release-ready v1** scope and an **ordered implementation plan** with verifiable acceptance tests.

Cloned is a local-first agent operating system with:
- Conversational onboarding that selects **blueprints**
- A **capability graph** that maps goals -> required capabilities -> connectors/tools
- Connector framework (MCP-first) and a **signed distribution model**
- Seamless GitHub onboarding: **OAuth bootstrap + GitHub App automation**
- Multi-tier governance: Personal / Shared / Enterprise policy packs
- Vault-first secrets, budgets, approvals, audit logs
- **Command Center UI** (professional “hyperscaler-like” dashboard) + CLI/TUI

v1 is allowed to ship with features flagged as “beta”, but all essentials are present:
- safe onboarding, identity connection, vault, audit, approvals, budgets
- extensibility model (connectors + skills) with signing
- a real UI command center to observe and control runs and integrations

Start here:
- `PLAN/v1_workplan.md` (order of operations + acceptance tests)
- `MODEL/capability_graph.md`
- `MARKETPLACE/signing_trust_model.md`
- `UX/command_center.md`
- `HANDOFF/spec_to_implement.md`
