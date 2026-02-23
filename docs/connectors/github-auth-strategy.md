---
title: "GitHub onboarding auth strategy (v1) — OAuth Bootstrap + GitHub App Automation"
description: ""
audience: [developers]
category: connectors
---

# GitHub onboarding auth strategy (v1) — OAuth Bootstrap + GitHub App Automation

This spec updates GitHub onboarding to be **seamless and secure** without relying on long-lived PATs.

## Summary
- Use **user OAuth** only for bootstrap steps (sign-in, selecting target org/repos, optional repo creation).
- Transition to **GitHub App installation access tokens** for ongoing automation.
- Enforce least privilege and short-lived credentials.
- Never request passwords; never automate creation of GitHub personal accounts.

## Auth phases (state machine)
1. **Unauthed**
2. **UserAuthed (OAuth)**: user authorized Cloned for bootstrap.
3. **AppInstallPending**: user must install the Cloned GitHub App on chosen org/repos.
4. **AppInstalled**: installation IDs recorded; permissions validated.
5. **AppActive**: all automation uses GitHub App installation tokens; user OAuth not required for routine operations.

Persisted state in `.cloned/state.db`:
- `github.oauth_ref` (reference to token stored in vault, not raw token)
- `github.installations[]` (org/repo, installation_id)
- `github.permissions_snapshot`
- `github.last_validation_at`

## UX requirements
### UI (preferred)
- Button: **Connect GitHub**
- Steps:
  1) Sign in with GitHub (OAuth)
  2) Choose target: personal account or org
  3) Select repos: existing or create new (if permitted)
  4) Install Cloned GitHub App (scope to selected repos)
  5) **Show installation details** – pull `/user/installations` (or org equivalent) and surface the installation ID + target slug so the user never hunts through GitHub settings manually.
  6) Prompt for GitHub App ID + private key upload. The UI should call `cloned vault` APIs to store both and never keep PEM text in local state beyond the request.
  7) Verify installation and permissions
  8) Status: **Automation ready**

### CLI
- Bootstrap: `cloned connect github`
  - Device-flow UX (URL + code) signs in and records **UserAuthed** state in `.cloned/state.db`.
  - Access token is stored in the vault (`vault.dev.json` or Azure provider) only.
- Completion: `cloned connect github --complete-install --installation-id <id> --app-id <app_id> --private-key-path ./cloned-app-private-key.pem`
  - Installation ID lives at GitHub → Settings → Applications → **Installed GitHub Apps** → Cloned (copy the numeric ID from the URL). For org installs: Org → Settings → GitHub Apps.
  - Private key: GitHub → Settings → Developer settings → GitHub Apps → Cloned → Generate private key. Save the `.pem` locally and point `--private-key-path` at it; the CLI writes the contents into the vault key `github.app.private_key`.
  - App ID: same GitHub App settings view (displayed near the top). You can also pre-seed `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` env vars.
- Verification: once the CLI has an installation ID + credentials it mints an installation access token to confirm **AppActive**. Subsequent GitHub tool calls prefer this short-lived token; the bootstrap OAuth token remains a fallback only.

## Permissions model (least privilege)
- Onboarding agent proposes permissions based on blueprint(s) enabled.
- Default baseline (v1) if Builder/Creator packs enabled:
  - Contents: Read/Write (branches, commits for PRs)
  - Pull requests: Read/Write
  - Issues: Read/Write
  - Actions: Read (Write only if dispatching workflows)
  - Metadata: Read
- Research-only: reduce to Issues/Metadata or omit GitHub entirely.

## Bootstrap actions (OAuth only)
Allowed under user OAuth during onboarding:
- enumerate orgs and repos user can access
- create repository (if user selects and permissions allow)
- create initial issues/labels/templates (optional)

After **AppActive**:
- use GitHub App installation tokens for all automation.

## Secrets handling
- Store GitHub App private key (or reference) **only in vault**.
- Store installation IDs in state.db (non-secret).
- Store OAuth token/refresh token **only in vault** if persisted at all.
- Redact all auth headers and token material from logs.

## Fallbacks (explicit, not default)
If org policy blocks GitHub Apps for required workflows:
- request a human-performed step (create repo, adjust settings)
- allow fine-grained PAT only as a break-glass option, stored in vault, time-limited, and strongly warned against
