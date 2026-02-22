---
title: "Prompt Injection"
description: ""
audience: [developers]
category: security
---

Prompt-Injection Resilience (v1)

Goals
- Treat all fetched/search/crawled content as untrusted input.
- Reduce model compliance with adversarial instructions embedded in content.
- Minimize data exfil and side-effect risk by constraining tools and egress.

Defenses Implemented
- Untrusted content guard: src/security/content-guard.ts strips scripts/tags, flags likely injection phrases (ignore previous, role change, credential requests, exfil commands). Synthesis uses sanitized text only.
- System prompt hardening: synthesis tool explicitly instructs to ignore instructions inside sources and treat them as quotes.
- Default-deny egress: runtime/safe-fetch.ts + runtime/egress.ts enforce per-tool and global allowlists. GitHub/YouTube connectors now use SafeFetch, closing a bypass.
- Approval gates: high-risk actions (e.g., publishing, firewall edits) require approvals per POLICY packs.
- Vault-first secrets and redaction: no secrets in logs; src/shared/redact.ts.

Planned Enhancements
- Out-of-process connectors with per-process env sandbox and network egress via a policy-aware proxy.
- Content provenance + render-to-text pipeline (readability, DOM sanitizer, block hidden text and iframes, strip forms/inputs).
- Domain reputation and per-domain prompt shields (e.g., treat user-generated sites as higher risk, add stronger LLM instructions).
- Model-side canary prompts and refusal patterns to detect/mitigate injection attempts.

Operational Guidance
- Keep allowlists narrow; prefer tool-scoped rules over global.
- Run local LLM via docker/compose.local-llm.yaml and set LLM_API_BASE to loopback.
- For crawling, never execute scripts; only fetch and render static text content.

