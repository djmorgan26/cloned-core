# Doctor Checks (v1)

Environment
- Node.js >= 20, npm/yarn/pnpm present
- SQLite available and writable workspace directory
- gitleaks installed (or vendored binary available)

Workspace
- `.cloned/` structure present with config, state, audit, registry
- Trust store files exist and parse
- Policy pack reference resolves and validates
- Policy pack UI.allowed_origins present or loopback-only deployment
- Policy pack egress allowlists defined (or default-deny acknowledged)

Security
- Secret scanning configuration enabled
- No secrets detected in recent commits (dry-run check)
- Server bind is loopback unless auth is configured
- IPv6 loopback (`::1`) treated as loopback; mixed-family binds validated
- Device pairing required for UI unless in explicit dev mode
- Auth failure rate limit configured (or default in effect)
- Host/Origin header validation enabled; reverse proxy use requires explicit `trustedProxies` config

Connectors
- Registry loads and signatures verify (dry-run)
- Revocations checked
- Runtime isolates connectors (no in-process untrusted code)
