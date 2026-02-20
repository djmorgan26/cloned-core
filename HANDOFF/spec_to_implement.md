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

## CLI commands
- `cloned init`
- `cloned onboard`
- `cloned connect <connector>`
- `cloned run <pipeline>`
- `cloned approvals`
- `cloned vault`
- `cloned doctor`

## Must-have UI (Command Center)
See `UX/command_center.md`. The UI must:
- show current system state and runs
- allow safe control (enable connector, run pipeline, approvals)
- never expose secrets


## GitHub onboarding
- Implement OAuth bootstrap + GitHub App automation as defined in `CONNECTORS/github_auth_strategy.md`.
