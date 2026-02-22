---
title: "Repository Plan and Release Strategy"
description: ""
audience: [developers]
category: repos
---

# Repository Plan and Release Strategy

## Repos
- cloned-core: CLI, local API server, workspace/state, registry, trust, signing verification, UI static serving
- cloned-runtime: Skill runner, pipelines, tool gating, policy enforcement
- cloned-connectors: Official connectors (MCP servers), tool schemas, manifests, examples
- cloned-knowledge: Knowledge utilities (ingestion, indexing templates, provenance helpers)
- cloned-ui: React app (built assets consumed by core), design system

## Submodules (within cloned-core)
- `modules/runtime` -> cloned-runtime
- `modules/connectors` -> cloned-connectors
- `modules/knowledge` -> cloned-knowledge
- `modules/ui` -> cloned-ui

## Dependency Direction
- core -> (runtime, connectors, knowledge, ui)
- runtime: no deps on core
- connectors: no deps on core; communicate via MCP
- ui: consumes OpenAPI from core

## Versioning
- Independent SemVer per repo; compatibility declared via matrix in core docs
- JSON Schemas and OpenAPI are semver’d independently; breaking schema changes require new major
- Tool schemas include explicit `schema_id` with version

## Release Orchestration
- Release train initiated from cloned-core
  1) Tag runtime/connectors/ui as needed
  2) Update core’s submodule pointers
  3) Tag core with a release manifest
- Dry-run mode prints planned tags and diffs without pushing

## CI/CD Invariants
- Lint + unit tests + schema validation on PR and main
- gitleaks secret scanning (block on findings)
- Dependency pinning checks
- Reusable workflows shared across repos via actions/reusable workflows
- Security checks: loopback bind defaults; reject non‑loopback binds without auth; device‑pairing tests for UI; auth failure rate‑limit tests

## Marketplace Alignment
- Connectors/skills packaged with `package.manifest.json`, `package.sig`, and publisher metadata
- Trust roots and revocation list read from workspace `.cloned/trust/`
