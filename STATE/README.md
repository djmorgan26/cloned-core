# State and Storage

SQLite
- Single file DB at `.cloned/state.db` in WAL mode for crash resilience.
- Schema in `STATE/sqlite_schema.sql`.
- No secrets stored; only references and metadata.

Files
- Registry (`.cloned/registry.yaml`), policy packs, and trust store live as files for transparency.
- Audit logs are line-delimited JSON with chain hashes and are mirrored into SQLite for queryability.

Recovery
- WAL ensures atomicity; doctor checks recoverability and chain continuity.
- On corruption, fail closed for approvals and vault-dependent actions.

