---
title: "Capability Graph Data Model (Spec-Only)"
description: ""
audience: [developers]
category: model
---

# Capability Graph Data Model (Spec-Only)

## Purpose
A capability graph allows Cloned to translate user goals into a concrete setup:
- which capabilities are needed
- which connectors/tools provide them
- what prerequisites and permissions are required
- what manual steps remain

## Entities
### Capability
A normalized capability such as:
- `cap.research.web_search`
- `cap.dev.repo_management`
- `cap.content.video_packaging`
- `cap.identity.vault_secrets`
- `cap.comm.slack_posting`

Fields:
- id (string)
- description
- risk_level (low/med/high)
- cost_model (none/variable/fixed) + notes
- required_approvals (list)
- prerequisites (list of capabilities)

### Tool
A concrete tool action exposed by a connector, e.g.:
- `cloned.mcp.github.issue.create@v1`
- `cloned.mcp.youtube.video.upload@v1`

Fields:
- id, version
- schema_id (JSON Schema identifier)
- permissions_required (scopes/roles)
- cost_metadata (estimator inputs)
- redaction_rules

### Connector
An installable package that provides tools and declares capabilities.

Fields:
- id (e.g., `connector.github.app`)
- version (semver)
- publisher_id
- signature and integrity hashes
- tools (list)
- provides_capabilities (list)
- requires_capabilities (list)  # prereqs (e.g., vault configured)
- manual_steps (list)           # user steps (OAuth, app install)

### Blueprint
A plan that targets a goal set and references required capabilities.

Fields:
- id, version
- goals
- required_capabilities
- preferred_connectors (ordered)
- policy_pack
- first_run_pipeline

## Graph structure
- Nodes: capabilities, connectors, tools, blueprints
- Edges:
  - blueprint -> required_capability
  - connector -> provides_capability
  - connector -> tool
  - capability -> prerequisite_capability
  - tool -> capability (implements)

## Algorithms (v1)
1) Goal intake -> candidate blueprints
2) For chosen blueprint, compute required capabilities closure (include prerequisites)
3) Select connectors that cover required capabilities:
   - prefer user’s existing connectors
   - prefer verified publishers
   - choose minimal set that covers graph
4) Produce a setup plan:
   - install connectors
   - perform manual steps
   - run validations
   - run first pipeline

## Outputs
- Plan of Record (markdown)
- Registry updates in `.cloned/registry.yaml`
- A checklist of manual steps and validations
