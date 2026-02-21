# Redaction Policy (Unified)

Goals
- Prevent secrets/PII from appearing in logs, UI, or telemetry.
- Provide reproducible hashes for inputs without exposing values.

Redaction Classes
- `secret`: credentials, tokens, private keys
- `token`: OAuth/PAT/headers
- `pii`: names, emails, phone numbers when not essential
- `header`: any HTTP header values
- `path`: local file paths

Mechanics
- Structured redaction with markers: replace values with `[REDACTED:<CLASS>]`.
- Hashing: store salted SHA-256 of redacted fields for correlation.
- Connectors declare `redaction_rules` per tool; runtime applies union of rules with workspace policy.
- Never log request bodies for high-risk tools unless fully redacted.
- Sanitize headers in logs (limit length, strip control characters) and never log Authorization/
  cookies; replace with `[REDACTED:header]` + hash.

Libraries
- A shared redaction module used by CLI, API, runtime, and connectors.
