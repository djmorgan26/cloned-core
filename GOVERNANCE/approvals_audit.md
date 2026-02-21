# Approvals and Append-Only Audit (v1)

Approvals
- Queue of pending requests keyed by `id` with scope, payload hash, and actor.
- Decisions are append-only; changing a decision creates a new record with a new `id` referencing the prior in chain (or a new decision row with updated `status` and chain hash).
- All approvals reference budgets and risk to drive policy decisions.

Audit
- Each tool call yields an audit entry referencing tool, schema, input hash, policy decision, outcome, and optional artifact manifest hash.
- Entries include `chain_prev_hash` and computed `chain_this_hash` for tamper evidence.
- Logs are line-delimited JSON on disk and mirrored into SQLite for queries.

Chain hash
- `chain_this_hash = H(chain_prev_hash || canonical_json(entry_without_chain_fields))`
- Rotation: allow rotation points that reset `chain_prev_hash` with a checkpoint marker; record rotation in audit.

Redaction
- No secrets or tokens; instead store salted hashes of redacted fields.
- Ensure header sanitation and size limits.

