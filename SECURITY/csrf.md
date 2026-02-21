# CSRF Strategy (UI over Local API)

Context
- UI runs in a browser and calls the local API.
- Device pairing gates access; allowed origins are enforced.

Approach (defense-in-depth)
- Primary: bearer token tied to a paired device identity and approved scopes, sent via `Authorization: Bearer <token>`.
- Secondary: double-submit CSRF token for browser-based POST/PUT/DELETE.

Mechanics
- On successful device pairing, mint a session with:
  - `session_id` and `access_token` (short-lived, renewable) for the Authorization header.
  - `csrf_token` bound to `session_id`.
- UI stores `access_token` in memory (never localStorage) and sends on each request.
- UI also sends `X-CSRF-Token: <csrf_token>` on mutating requests; server verifies token matches session.
- Cookies (if used) are `SameSite=Strict`, `Secure`, `HttpOnly`. Prefer header-based tokens to avoid CSRF via cookies.

Additional checks
- Enforce `Origin` and `Host` header checks; reject if not in allowed origins/policy or if Host header mismatch.
- Rate-limit auth failures and pairing attempts.

Dry-run
- CSRF verification is simulated; responses include headers that would be required without returning secrets.

