---
title: "Stack and Architecture Choices (v1 and beyond)"
description: ""
audience: [developers]
category: architecture
---

# Stack and Architecture Choices (v1 and beyond)

## Principles
- Local-first by default; cloud-optional. No secrets in git or logs.
- Strong governance: approvals, budgets, and audit are first-class.
- Extensible via MCP connectors and skill packs; signed distribution.
- Backward-compatible schemas and stable APIs to allow marketplace growth.

## Primary Stack
- Core/CLI/API: Node.js 20+ with TypeScript
  - CLI: Commander (or oclif) with a shared command framework
  - API: Fastify + OpenAPI 3.1 (generated types via openapi-typescript)
- UI: React 18 + TypeScript, Vite build, served locally by core
- Runtime (skills/pipelines/tool gating): TypeScript library consumed by core
- Connectors: MCP-first, polyglot (Node/Python/Rust allowed), packaged with signed manifests

## Data & State
- Workspace state: SQLite (`.cloned/state.db`) in WAL mode for crash resilience
- Registry + policies: YAML/JSON files under `.cloned/` with JSON Schema validation
- Audit logs: line-delimited JSON with chain hashes and fsync on append; rotation policy

## Schemas & Contracts
- JSON Schema Draft 2020-12 for configs, registry, manifests, blueprints, artifacts
- OpenAPI 3.1 for local API surface used by UI/CLI
- Ed25519 signatures for package verification (libsodium family)

## Secrets & Vault
- BYOV Azure Key Vault as production provider
- Dev-only local provider (file-backed) with explicit warnings
- Only store references in state; never store raw secrets on disk outside vault

## Identity, Pairing, and Access
- Device pairing for UI and nodes using signed device identities
- UI sessions require paired device + explicit scopes
- Per‑IP auth rate limiting for shared‑secret modes
- Loopback bind by default; refuse public binds without auth

## Network Egress & Data Sources
- Default‑deny egress; policy‑based domain allowlists per connector/tool
- Connectors must declare intended egress hosts (verified by policy)

## Observability
- Structured logs (JSON) with aggressive redaction by shared module
- Optional local OTEL exporter; remote telemetry opt-in and redacted

## Performance & Scale Outlook
- All file formats and APIs versioned; additive evolution preferred
- Runtime is process-isolated with policy-enforced tool invocation
- Multi-workspace support via separate `.cloned/` roots or managed index

## Monetization Strategy (long-term viability)
- Marketplace: paid connectors and skill packs with signed packages and revenue share
- Enterprise: Governance features (multi-workspace policy, SSO/SAML, audit export) and support plans
- Managed add-ons: optional cloud sync, key management helpers, catalog of verified publishers
- Verification: paid publisher verification tier and revocation monitoring

## Data Source Strategy (flexible and restrictive)
- Generic data connector template (MCP) for arbitrary sources with capability/risk tags
- Workspace policy to restrict tools/capabilities to specific sources (allowlists)
- Data provenance tracked in artifact manifests for trust and compliance

## Legal/Research Use Cases (future-ready)
- Blueprint pattern supports domain-specific extensions (e.g., legal research)
- Connectors for document ingestion, retrieval (BYO sources), and citation tooling
- Strict policy defaults to prevent accidental access to restricted sources
