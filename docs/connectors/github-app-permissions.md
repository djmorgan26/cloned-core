---
title: "GitHub App Permissions (by Blueprint)"
description: ""
audience: [developers]
category: connectors
---

# GitHub App Permissions (by Blueprint)

Baseline (Builder/Creator)
- Contents: Read/Write
- Pull requests: Read/Write
- Issues: Read/Write
- Actions: Read (Write only if dispatching workflows)
- Metadata: Read

Research-only
- Issues: Read
- Metadata: Read

Operational Notes
- OAuth used only for bootstrap; installation tokens thereafter
- Installation IDs stored in state (non-secret); private key ref stored in vault
- Periodic permission validation and drift detection

