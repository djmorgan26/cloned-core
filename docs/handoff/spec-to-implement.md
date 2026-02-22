---
title: "Implementation spec (v1)"
description: ""
audience: [developers]
category: handoff
---

# Implementation spec (v1)

Implement Cloned as modular repos with an ordered plan.

## Required repos (v1)
- cloned-core
- cloned-runtime
- cloned-connectors
- cloned-knowledge
- cloned-ui

## Interfaces
- Local API exposed by core for UI and agent control (OpenAPI recommended)
- Connector interface via MCP with JSON schemas
 - UI/node access requires device pairing and approved scopes

## CLI commands
- `cloned init`
- `cloned onboard`
- `cloned connect <connector>`
- `cloned run <pipeline>`
- `cloned approvals`
- `cloned vault`
- `cloned doctor`

## Must-have UI (Command Center)
See `[docs/ux/command-center.md](../ux/command-center.md)`. The UI must:
- show current system state and runs
- allow safe control (enable connector, run pipeline, approvals)
- never expose secrets
 - enforce device pairing and allowed origins; loopback bind by default


## GitHub onboarding
- Implement OAuth bootstrap + GitHub App automation as defined in `[docs/connectors/github-auth-strategy.md](../connectors/github-auth-strategy.md)`.

## Security posture (v1)
- Loopback bind by default; refuse public binds without auth
- Auth failure rate limiting with Retry-After
- Connectors run out-of-process under policy gating and domain egress allowlists
- Vault-first secrets; only references in state/config
