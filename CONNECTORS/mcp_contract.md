# MCP Connector Contract (v1)

Protocol
- MCP over stdio or HTTP; must advertise protocol version.

Handshake
- Connector returns metadata:
  - connector `id`, `version`, `publisher_id`
  - tools: `id`, `version`, `schema_id`, `capability`
  - input schemas (JSON Schema IDs)
  - redaction rules and permissions_required
  - provides_capabilities, requires_capabilities

Runtime Expectations
- Runtime validates tool schemas and merges redaction rules with policy
- Tool allowlists enforced before dispatch; blocked tools are not called
- Dry-run: runtime never dispatches; must not require connector reachability to compute plan
- Egress policy: connector must declare intended outbound hosts (exact or wildcard);
  runtime enforces domain allowlists from policy (default-deny)

Errors & Status
- Standard error envelope with code, message, retriable flag
- Cost metadata optional; if unknown, runtime treats as `requires_approval=true`

Security
- No secrets in logs; do not print tokens or payloads
- Prefer short-lived tokens (OAuth device flow or app installation tokens)
- Connectors run out-of-process under least privilege; environment sanitized
