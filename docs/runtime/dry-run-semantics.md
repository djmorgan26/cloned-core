---
title: "Global Dry-Run Semantics"
description: ""
audience: [developers]
category: runtime
---

# Global Dry-Run Semantics

Dry-run (`--dry-run`) is supported by all commands and tool executions.

Principles
- No external side effects: no network calls that mutate, no writes outside ephemeral planning.
- Full validation: schemas, policy decisions, approvals, and cost estimation still run.
- Audit-safe: record as dry_run in run logs; append-only audit entries may be included but must be marked `dry_run` and exclude side-effect fields.

CLI Commands
- `cloned init`: show files and DB tables to be created, not create them.
- `cloned onboard`: compute blueprint, plan steps, and required approvals.
- `cloned connect <connector>`: verify signatures and compatibility without installing; show manual steps.
- `cloned run <pipeline>`: render planned tool calls, costs, and approval gates.
- `cloned approvals`: show pending and simulated decisions; no state changes.
- `cloned vault`: validate provider configuration; never read/show values.
- `cloned doctor`: run checks; no auto-fixes.

Runtime Tool Calls
- Construct Tool Call Envelope; compute `cost_estimate`, `requires_approval`.
- If dry_run: do not dispatch to connector; present redacted request preview.
- Budgets: simulate consumption and report if over cap.

