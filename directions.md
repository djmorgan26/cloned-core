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
Inside `cloned-core`, add submodules per [docs/repos/repo-plan.md](docs/repos/repo-plan.md):
- modules/runtime -> cloned-runtime
- modules/connectors -> cloned-connectors
- modules/knowledge -> cloned-knowledge
- modules/ui -> cloned-ui (if UI is separate)

## 4) What to tell your coding agents (order)
1) [docs/plan/v1-workplan.md](docs/plan/v1-workplan.md)
2) [docs/plan/v1-acceptance-tests.md](docs/plan/v1-acceptance-tests.md)
3) [docs/plan/public-v1-essentials.md](docs/plan/public-v1-essentials.md)
4) [docs/model/capability-graph.md](docs/model/capability-graph.md)
5) [docs/marketplace/signing-trust-model.md](docs/marketplace/signing-trust-model.md)
6) [docs/ux/command-center.md](docs/ux/command-center.md)
7) [docs/connectors/github-auth-strategy.md](docs/connectors/github-auth-strategy.md)
8) [docs/handoff/spec-to-implement.md](docs/handoff/spec-to-implement.md)

## 5) GitHub onboarding (Option 1)
Connect GitHub as:
- user signs in via OAuth (bootstrap)
- user installs the Cloned GitHub App on chosen org/repos
- automation uses short-lived GitHub App installation tokens thereafter
