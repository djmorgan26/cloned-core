# Directions (updated for GitHub onboarding)

## 1) Create repos (v1 required)
- cloned-core
- cloned-runtime
- cloned-connectors
- cloned-knowledge
- cloned-ui

## 2) Seed cloned-core
- Unzip this pack into the root of `cloned-core/`
- Commit and push

## 3) Submodules
Inside `cloned-core`, add submodules per `REPOS/repo_plan.md`:
- modules/runtime -> cloned-runtime
- modules/connectors -> cloned-connectors
- modules/knowledge -> cloned-knowledge
- modules/ui -> cloned-ui (if UI is separate)

## 4) What to tell your coding agents (order)
1) PLAN/v1_workplan.md
2) PLAN/v1_acceptance_tests.md
3) PLAN/public_v1_essentials.md
4) MODEL/capability_graph.md
5) MARKETPLACE/signing_trust_model.md
6) UX/command_center.md
7) CONNECTORS/github_auth_strategy.md
8) HANDOFF/spec_to_implement.md

## 5) GitHub onboarding (Option 1)
Connect GitHub as:
- user signs in via OAuth (bootstrap)
- user installs the Cloned GitHub App on chosen org/repos
- automation uses short-lived GitHub App installation tokens thereafter
