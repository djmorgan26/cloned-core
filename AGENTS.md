# Coding Agent Instructions (Claude Code / Codex)

## Objective
Implement Cloned v1 according to these specs and the ordered plan.

## Non-negotiables
- No secrets in git; no secrets in logs; redact aggressively.
- Cost-incurring actions require explicit owner approval.
- Do not automate prohibited third-party account creation (GitHub/Gmail); use compliant flows.
- Prefer OAuth, GitHub Apps, managed identities, short-lived tokens.

## Quality and verification
- Every milestone must be validated with the acceptance tests in PLAN/v1_acceptance_tests.md.
- All commands must support `--dry-run`.
- All tool calls must be auditable (redacted) and reproducible.
