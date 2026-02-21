# Security Hardening (v1)

- Bind to `127.0.0.1` by default; refuse non-loopback binds without auth.
- UI requires device pairing (signed device identity + approval) and allowed origins.
- Auth failures are rate-limited; repeated failures return 429 with `Retry-After`.
- Vault-first secrets; only store references in state/config.
- Connectors run out-of-process under policy: tool allowlists, domain egress allowlists (default-deny).
- Redaction everywhere: tokens/headers/PII never logged; salted hashes for correlation.
- Capability-scoped embedded URLs require short-lived tokens (TTL, sliding refresh).
