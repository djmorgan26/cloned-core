---
title: "Egress Matching and Resolution (v1)"
description: ""
audience: [developers]
category: runtime
---

# Egress Matching and Resolution (v1)

Goal: deny-by-default outbound network access and allow only explicitly permitted domains.

Inputs
- Policy allowlists (policy pack):
  - `allowlists.egress_by_tool[tool_id]`
  - `allowlists.egress_by_connector[connector_id]`
  - `allowlists.egress_domains` (global)
- Connector declarations:
  - connector `egress_hosts[]`
  - per-tool `egress_hosts[]`

Resolution order
1) Compute the intended outbound host from the tool call (connector/tool declaration is required). If absent, deny.
2) Match against policy allowlists in order: tool -> connector -> global. First match wins.
3) If no match, deny with an explicit error and audit entry.

Matching rules
- Exact host match: `api.example.com` equals `api.example.com`.
- Wildcards: `*.example.com` matches any single-label subdomain of `example.com`.
- No implicit scheme/port allowance: policies match hostnames; runtime enforces scheme/port policy separately if needed.
- Internationalized domains: convert to punycode (IDNA) before match.
- IP literals: blocked by default except loopback (`127.0.0.1`, `::1`) and RFC1918 space only if a policy explicitly allows the literal.
- DNS rebinding guard: for HTTP requests, validate the `Host` header matches the allowed hostname and prefer DNS pinning for long-lived connections.

Connector obligations
- Declare all intended outbound hosts (exact or wildcard). Use the narrowest feasible set.
- Avoid wildcard `*` or `*.com`; such declarations are rejected by policy.

Runtime enforcement
- Before dispatch, compute `intended_host` and evaluate policy. If denied, do not invoke the connector.
- On allow, record the matched rule in the audit entry.
- Dry-run never dispatches and reports which rule (if any) would match.

Test cases (acceptance harness)
- Exact vs wildcard (`api.example.com` vs `*.example.com`).
- Punycode (`täst.example.com`).
- Subdomain pitfalls (`a.b.example.com` does not match `*.example.com`).
- IP literal blocked (`93.184.216.34`) unless allowed explicitly.
- Loopback allowed by default as per policy packs.

