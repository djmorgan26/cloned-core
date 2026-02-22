# v1 Container & Sandbox Plan

## Objectives
- Ensure any container we ship or ask users to run is loopback-bound, least-privilege, and auditable.
- Provide a roadmap to isolate agent/connector execution with predictable port assignments and firewall hooks.
- Make container security posture visible in docs/tests so regressions are caught early.

## Scope
1. **Local LLM Container (Immediate)**
   - Harden docker/compose.local-llm.yaml: loopback-only port, non-root user, read-only FS with tmpfs exceptions, dropped capabilities, CPU/memory limits, healthcheck.
   - Provide validation (Jest) that compose security knobs remain enforced.
   - Update RUNTIME/containers.md with security checklist + port instructions.
2. **Connector/Agent Sandbox (Next)**
   - Build containerized (or pid/ns jailed) runner for connectors: JSON-RPC over stdio, ephemeral workspace volume, SafeFetch proxy injection.
   - Introduce per-connector network namespaces or a shared internal docker network with egress proxy, only exposing approved ports to host.
   - CLI flag `--sandbox=container` to toggle.
3. **Port Governance & Monitoring (Later)**
   - Port allocation registry under `.cloned/ports.yaml` describing which service can bind which host ports.
   - `cloned doctor ports` command checks conflicts and ensures sockets bound to loopback.
   - Optional iptables/pf anchor script to enforce host-level firewall.

## Milestones
1. **Harden LocalAI compose (DONE in this change)**
   - Compose uses `127.0.0.1:8080:8080`, `read_only`, `tmpfs` for `/tmp`, `cap_drop: [ALL]`, `security_opt: no-new-privileges`, `user: 65532`, `mem_limit` + `cpus`, healthcheck.
   - Jest test verifies the compose file’s critical knobs.
   - Docs updated with verification steps.
2. **Container Runner Prototype (Planned)**
   - Build `src/runtime/container-runner.ts` launching connectors via `docker run --network cloned_sandbox --cap-drop=ALL --pids-limit=256 --read-only`.
   - Use unix-socket JSON-RPC, pass SafeFetch via proxy env.
   - Provide CLI flag to opt-in, plus plan for approvals when connectors request new ports.
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
