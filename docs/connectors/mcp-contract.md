---
title: "Mcp Contract"
description: ""
audience: [developers]
category: connectors
---

MCP-Style Connector Contract (Draft v1)

Package Layout
- Manifest: package.manifest.json (schemas/connector.manifest.schema.json)
- Files: tool modules and metadata. Hashes and optional signature included in manifest.

Manifest Fields (high level)
- id, version, publisher_id
- files: paths + integrity hashes
- tools[]: { tool_id, version, schema_id, egress_hosts[] }

Trust & Signing
- Verify publisher by .cloned/trust/publishers/*.json
- Verify package signature (Ed25519) and file hashes
- Check policy allowlists for publisher/tool IDs

Runtime Contract
- Tools expose a function(input) -> output; input/output validated by schema_id
- Out-of-process mode (roadmap): JSON-RPC over stdio using schemas/tool_call_envelope.schema.json
- Egress: declare egress_hosts[]; runtime enforces allowlists via SafeFetch

Versioning
- Tool IDs are stable; new versions published side-by-side.
- Breaking changes require new version and schema IDs.

Installation Flow
1) Verify signature and hashes
2) Verify publisher trust + policy
3) Register tools + metadata in .cloned/registry.yaml
4) Disabled by default until explicitly enabled

