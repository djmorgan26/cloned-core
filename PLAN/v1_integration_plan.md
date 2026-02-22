v1 Integration Plan (Extensible + Embeddable)

Goals
- Make it easy for other apps/platforms to leverage Cloned locally or embedded.
- Provide stable integration surfaces with space to expand capabilities over time.

Integration Surfaces
- CLI: `cloned` commands for init, run, approvals, connectors, firewall. Scriptable + CI-friendly.
- Local API: Fastify server (loopback by default) with OpenAPI at API/openapi.yaml. Endpoints: workspace, connectors, approvals, runs, budgets, vault status, doctor.
- Firewall Management API: `/firewall/allowlist` (GET for merged state, POST for proposed additions) and `/firewall/allowlist/remove` (POST) let external control planes submit allowlist edits that flow through approvals before touching `.cloned/policy/<pack>.yaml`.
- MCP-style Connectors: Package format defined by SCHEMAS/connector.manifest.schema.json; tools defined by SCHEMAS/tool.schema.json. Trust store under `.cloned/trust/` and signature verification per TRUST/structure.md.
- Skill Packs: Pipelines under src/runtime/skills/* with constitution-enforced allowed_tools. Third parties can ship skill packs referencing their connectors.
- Policy Packs: Workspace overlays in `.cloned/policy/` allow per-install customization without forking core packs.
- Artifacts + Provenance: Artifacts and manifests in `.cloned/artifacts/` via `cloned.internal.artifact.save@v1` with SCHEMAS/artifact_manifest.schema.json.

Extensibility Guarantees (v1)
- Semantic Versioning for schemas: backward-compatible changes within minor versions; breaking only on major.
- API stability window: keep route shapes stable across minor releases; deprecate with warnings.
- Tool IDs and versions are immutable once published; new versions must be explicitly declared.

SDK + Contract (Roadmap)
- Node SDK: minimal helpers for tool registration, policy-aware HTTP (SafeFetch), and vault access.
- Out-of-process connector worker: JSON-RPC over stdio with envelope SCHEMAS/tool_call_envelope.schema.json; SafeFetch enforced at host.
- Webhooks/Events: local SSE or webhook callbacks for run/approval/audit events to integrate with external UIs or orchestrators.

Embedding Patterns
- Local-first embed: run API on loopback and communicate over HTTP; package UI as a module or use the API from host app.
- Headless mode: use CLI/SDK only; read `.cloned/artifacts/` and `.cloned/audit.log` for outputs and provenance.

Connector Marketplace Path
- Signed connectors with publisher trust verified via TRUST/; policy allowlists gate which publishers are permitted.
- Registry YAML at `.cloned/registry.yaml` supports local catalog and enable/disable per workspace.
- Policy overlay contract documented: CLI + API write YAML overlays only after approval; include change metadata (requested_by, approved_by, audit hash) so host platforms can reason about provenance.

Acceptance/Readiness
- OpenAPI describes all public endpoints.
- Example connector + example skill pack build/run against stable contracts.
- Integration examples: minimal Node client and shell scripts (CI) documented.
