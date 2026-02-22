---
title: "Budgets and Enforcement (v1)"
description: ""
audience: [developers]
category: governance
---

# Budgets and Enforcement (v1)

Categories
- See `[docs/cost/cost-model.md](../cost/cost-model.md)` for baseline categories.

Policy
- Policy packs define category caps and periods.
- Unknown-cost tools require approval; otherwise deny.

Runtime
- On each tool call, compute cost estimate. If exceeding remaining budget for the active window, block and write an audit entry.
- Windows roll over by category; `window_start` marks current window start in DB. At roll-over, reset `used` to 0 and set new `window_start`.
- Dry-run simulates consumption and reports would-be blocks.

Recovery
- On crash, budgets table uses WAL durability. Doctor verifies integrity; no negative usage allowed.

