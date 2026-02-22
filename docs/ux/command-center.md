---
title: "Command Center UI (v1 Essential)"
description: ""
audience: [developers]
category: ux
---

# Command Center UI (v1 Essential)

## Objective
Provide a professional, intuitive dashboard similar to hyperscaler consoles:
- clear navigation
- status summaries with drill-down
- safe actions with confirmations and approvals
- observable runs and logs

## Information architecture (v1)
Left nav:
1. Overview
2. Workspaces (if multiple)
3. Connectors
4. Skills & Pipelines
5. Runs (live + history)
6. Approvals
7. Budgets
8. Secrets (health only)
9. Settings (policy packs, trust roots)

## Core screens
### Overview
- workspace type, policy pack, platform version
- connector health summary
- budgets summary
- recent runs and approvals

### Connectors
- installed connectors, versions, signature status
- capabilities provided
- enable/disable per workspace
- “Install connector” flow with signature verification UI

### Runs
- live run progress (steps, tools used, outputs)
- redacted logs
- artifacts produced (links)

### Approvals
- pending approval cards with:
  - action, estimated cost/risk, rollback plan
  - approve/deny
- decision history

### Budgets
- caps per tool category
- usage summaries and alerts

### Secrets
- vault provider configured
- secret references (names/ids) without values
- rotation status and last access timestamps (optional)

## Design requirements
- No secrets displayed
- All destructive actions require confirmation + approval record
- UI must work locally; hosted later
- UI must call local API endpoints exposed by core (OpenAPI spec recommended)

## Security requirements (updated)
- Device pairing required for UI sessions (signed device identity + approval)
- Strict CSP, no inline scripts; X-Frame-Options DENY; no secrets in responses
- Allowed origins must match loopback or explicit allowlist in policy pack
- Loopback bind by default; non-loopback binds require explicit auth and policy gate
- Auth failures are rate limited and return 429 with Retry-After
