---
title: "V1 Security Plan"
description: ""
audience: [admins, developers]
category: plan
---

v1 Security Plan (User‑Controllable, Local‑First)

Objectives
- Local LLM by default in a self-hosted container (no external model calls unless explicitly allowed).
- User‑controllable firewall: default‑deny egress with simple CLI and skill (MCP‑style) to modify allowlists under approval.
- Multi‑layer defenses: policy, approvals, audit, content guards, and isolation.

Architecture
- Model runtime: openai‑compatible local server via docker/compose.local-llm.yaml. App reads LLM_API_BASE/LLM_API_KEY from vault/env.
- Egress enforcement: runtime/safe-fetch.ts and runtime/egress.ts. All tools and connectors must use SafeFetch (patched GitHub/YouTube).
- Policy overlays: workspace .cloned/policy/<pack>.yaml overrides built‑in packs. CLI and tool write to this file.
- Firewall control:
  - CLI: `cloned firewall list|allow|remove` updates allowlists.
  - Skill: `cloned.internal.security.egress.update@v1` (approval‑gated) updates allowlists programmatically.
- Content guard: src/security/content-guard.ts sanitizes and flags untrusted text; synthesis uses sanitized input and hardened prompts.
- Approvals: POLICY packs require approval for security edits and high‑risk actions (publish/upload).
- Future isolation: connectors move to out‑of‑process workers with minimal env and policy‑aware HTTP proxy for network.

Milestones
1) Close egress gaps (DONE): SafeFetch enforced for GitHub/YouTube connectors.
2) Workspace‑override policy (DONE): registerBuiltinTools loads pack with overrides; CLI writes workspace pack.
3) Firewall UX (DONE): CLI + approval‑gated skill in runtime.
4) Local LLM container (DONE - compose file, docs): user points LLM_API_BASE to loopback.
5) Content guard (DONE - initial): sanitizer + flags + prompt hardening.
6) Out-of-process connectors (IN PROGRESS): Docker-based sandbox runner (`--sandbox container`) executes tools via SafeFetch-aware JSON-RPC, dropping caps and mounting the repo read-only. Remaining work: approval workflow for custom networks, optional dedicated proxy container, and non-Docker jail backends.
7) Egress proxy (NEXT): optional local proxy container; runtime routes HTTP through proxy; proxy enforces domain allowlists and logs.
8) API hardening (NEXT): strict CSP, device pairing enforcement everywhere, rate limiting tuned, on‑send redaction audit.
9) Crawler fetcher (NEXT): safe page fetch -> sanitize -> readability extraction; never execute JS.

Acceptance Criteria
- Default LLM calls hit localhost when LLM_API_BASE points to loopback; outbound model calls are blocked unless allowed.
- `cloned firewall allow --tool cloned.mcp.web.search@v1 api.search.brave.com` persists and takes effect immediately.
- Running a tool to non‑allowlisted host throws EgressBlockedError and writes a redacted audit entry.
- `cloned.internal.security.egress.update@v1` requires approval per policy; denial leaves pack unchanged.
- Synthesis does not echo or follow malicious source instructions; flagged inputs are noted in logs.

De‑risks
- Secrets never printed (existing redaction) and not sent to untrusted domains.
- Narrow allowlists reduce blast radius; approvals gate sensitive actions.
- Local model avoids third‑party data exposure by default.
