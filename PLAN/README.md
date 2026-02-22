Planning Index and Status

Docs (single place to find plans)
- v1 Workplan: PLAN/v1_workplan.md
- Acceptance Tests: PLAN/v1_acceptance_tests.md
- Launch Readiness: PLAN/launch_readiness.md
- Public v1 Essentials: PLAN/public_v1_essentials.md
- Security Plan: PLAN/v1_security_plan.md
- Integration Plan: PLAN/v1_integration_plan.md
- Container & Sandbox Plan: PLAN/v1_container_security_plan.md

Current Status (summary)
- Security foundations: egress firewall CLI + approval tool, SafeFetch in connectors, content guard, local LLM compose – done.
- Researcher pipeline: core tools in place; running with local LLM is supported.
- Trust model/schemas: present; connector runtime signing verification partially documented.
- UI: basic structure exists; firewall controls not yet in UI.
- Next: out-of-process connectors, crawler fetch + sanitize, API hardening and UI controls.

How to Update Plans
- Keep all new planning docs under PLAN/.
- Update this index with links and a short status line.
