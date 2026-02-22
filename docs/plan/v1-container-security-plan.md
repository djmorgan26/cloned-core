---
title: "v1 Container & Sandbox Plan"
description: ""
audience: [admins, developers]
category: plan
---

# v1 Container & Sandbox Plan

## Objectives
- Ensure any container we ship or ask users to run is loopback-bound, least-privilege, and auditable.
- Provide a roadmap to isolate agent/connector execution with predictable port assignments and firewall hooks.
- Make container security posture visible in docs/tests so regressions are caught early.

## Scope
1. **Local LLM Container (Immediate)**
   - Harden docker/compose.local-llm.yaml: loopback-only port, non-root user, read-only FS with tmpfs exceptions, dropped capabilities, CPU/memory limits, healthcheck.
   - Provide validation (Jest) that compose security knobs remain enforced.
   - Update docs/runtime/containers.md with security checklist + port instructions.
2. **Connector/Agent Sandbox (Shipped v1)**
   - Docker-based runner executes tools via JSON-RPC over stdio, mounting the repo read-only plus a tmpfs scratch dir. SafeFetch runs inside the container so policy allowlists continue to apply.
   - Containers drop caps, run as `node`, mount `/workspace` read-only, and receive per-run names (visible via `docker ps`).
   - CLI flag `--sandbox=container` selects the mode; `cloned firewall proxy` / `CLONED_EGRESS_PROXY` configure the optional HTTP proxy injected into the sandbox.
3. **Port Governance & Monitoring (Later)**
   - Port allocation registry under `.cloned/ports.yaml` describing which service can bind which host ports.
   - `cloned doctor ports` command checks conflicts and ensures sockets bound to loopback.
   - Optional iptables/pf anchor script to enforce host-level firewall.

## Milestones
1. **Harden LocalAI compose (DONE in this change)**
   - Compose uses `127.0.0.1:8080:8080`, `read_only`, `tmpfs` for `/tmp`, `cap_drop: [ALL]`, `security_opt: no-new-privileges`, `user: 65532`, `mem_limit` + `cpus`, healthcheck.
   - Jest test verifies the compose file’s critical knobs.
   - Docs updated with verification steps.
2. **Container Runner Prototype (DONE)**
   - `src/runtime/container-runner.ts` launches `node:20-alpine` containers with `--read-only`, `--tmpfs /tmp`, `--cap-drop=ALL`, `no-new-privileges`, `--pids-limit 256`, CPU/memory throttles, and read-only bind of the repo at `/workspace`.
   - JSON payloads flow over stdio into `dist/runtime/container/worker.js`, which instantiates SafeFetch and calls the tool handlers. Proxy env vars come from `CLONED_EGRESS_PROXY` or `cloned firewall proxy --set`.
   - Users toggle via `cloned run ... --sandbox container`; future work: approvals before granting custom networks/ports.
3. **Network Policy Integration (Planned)**
   - Provide optional Traefik/Envoy container as egress proxy; connectors route HTTP via `http_proxy` env.
   - Firewall CLI + API can write proxy ACLs.
4. **Port Registry + Doctor (Planned)**
   - Document `PORTS.md` + add doctor subcommand verifying actual binds.

## Acceptance Criteria
- `docker compose -f docker/compose.local-llm.yaml up -d` results in a container that only exposes 8080 on loopback, runs as non-root, fails if it attempts to write outside tmpfs, and passes healthcheck.
- `npm test` includes a suite ensuring compose security guardrails are intact.
- Container runner prototype (later milestone) executes a sample connector in isolation and denies additional port bindings.

## Follow-ups
- Evaluate rootless docker/podman support (esp. Linux) for the sandbox runner.
- Integrate doctor checks into CI once container runner lands.
