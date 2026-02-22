# Egress Allowlists (v1)

Default is deny-all egress. Allow outbound domains via policy packs:

- allowlists.egress_domains: global domains (`example.com`, `*.example.org`)
- allowlists.egress_by_connector: per-connector overrides (id -> [domains])
- allowlists.egress_by_tool: per-tool overrides (tool id -> [domains])

Resolution order (most specific wins): tool -> connector -> global.

Connectors must declare intended outbound hosts in their manifests; runtime enforces policy before dispatch.
