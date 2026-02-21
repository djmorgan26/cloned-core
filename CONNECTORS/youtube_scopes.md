# YouTube OAuth Scopes (v1)

Scopes
- `https://www.googleapis.com/auth/youtube.upload` (required for publish)
- `https://www.googleapis.com/auth/youtube.readonly` (status/metadata)

Defaults
- Assist-mode only by default (package generation); publish gated by approval and budgets
- Refresh tokens stored in vault; only references in state

