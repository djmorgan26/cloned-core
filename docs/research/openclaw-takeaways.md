---
title: "OpenClaw: What to Emulate vs Avoid (High-Level)"
description: ""
audience: [developers]
category: research
---

# OpenClaw: What to Emulate vs Avoid (High-Level)

Context
- We reviewed public discussions and patterns from OpenClaw-style projects. They went viral quickly, had bold ideas, but made notable security tradeoffs.

Good ideas to emulate
- Spec-first mindset and rapid connector iteration.
- Clear plugin/package boundaries and an "easy path" to add functionality.
- Community energy around recipes/skills and visible logs.

What to avoid (our design already addresses these)
- Long-lived tokens and secrets in env/logs — Cloned uses BYO vault, redaction, and short-lived tokens.
- Broad, ungoverned egress — Cloned enforces deny-by-default domain allowlists with connector/tool declarations.
- Weak origin controls — Cloned requires allowed origins, strict CSP, and device pairing for UI.
- In-process untrusted code — Cloned runs connectors out-of-process under policy.
- Ship-now security mindset — Cloned codifies pairing, rate limits, and trust/revocation.

Net adjustments we adopted
- Device pairing + allowed origins baked into UI and API contracts.
- Append-only approvals/audit with chain hashes.
- Signed connector distribution and a default trust store.
- Global dry-run semantics to make all actions auditable and reversible.

