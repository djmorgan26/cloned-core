---
title: "Planning index"
description: "Index of planning and status documents."
audience: [admins, developers]
category: plan
---

Planning Index and Status

Docs (single place to find plans)
- v1 Workplan: [v1-workplan.md](v1-workplan.md)
- Acceptance Tests: [v1-acceptance-tests.md](v1-acceptance-tests.md)
- Launch Readiness: [launch-readiness.md](launch-readiness.md)
- Public v1 Essentials: [public-v1-essentials.md](public-v1-essentials.md)
- Security Plan: [v1-security-plan.md](v1-security-plan.md)
- Integration Plan: [v1-integration-plan.md](v1-integration-plan.md)
- Container & Sandbox Plan: [v1-container-security-plan.md](v1-container-security-plan.md)

Current Status (summary)
- Security foundations: egress firewall CLI + approval tool, SafeFetch in connectors, content guard, local LLM compose – done.
- Connector sandbox runner: `--sandbox container` executes tools inside the hardened Docker runner; proxy/egress settings managed via `cloned firewall proxy` (port governance still TODO).
- Researcher pipeline: core tools in place; running with local LLM is supported.
- Trust model/schemas: present; connector runtime signing verification partially documented.
- UI: basic structure exists; firewall controls not yet in UI.
- Next: crawler fetch + sanitize, API hardening, UI controls, and host-level port registry/doctor.

How to Update Plans
- Keep all new planning docs under docs/plan/.
- Update this index with links and a short status line.
