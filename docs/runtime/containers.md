---
title: "Containers"
description: ""
audience: [developers]
category: runtime
---

Local Model + Network Isolation (Reference)

Goals
- Run the LLM locally in a container and point the app to it via LLM_API_BASE.
- Keep the model on loopback; block unintended outbound calls via policy.

Quick Start
- See docker/compose.local-llm.yaml (LocalAI, OpenAI‑compatible on :8080).
- export LLM_API_BASE=http://localhost:8080/v1 and set LLM_API_KEY (or vault: llm.api_key).

LocalAI Container Security (v1)
- Ports: mapped as `127.0.0.1:8080:8080` so the model API is reachable only from the host.
- User: runs as uid/gid 65532 (non-root). Adjust via `LOCALAI_UID/GID` env if needed.
- Filesystem: rootfs is read-only; `/tmp` is tmpfs (rw, noexec, nosuid). Model weights reside on the host bind mount `./models`.
- Kernel hardening: `no-new-privileges`, `cap_drop: [ALL]`, `pids_limit: 256`.
- Resources: `mem_limit: 8g`, `cpus: 4` (tune per host). Healthcheck hits `/health` inside the container.
- Verification:
  1. `docker compose -f docker/compose.local-llm.yaml up -d`
  2. `docker inspect cloned-localai --format '{{.HostConfig.PortBindings}}'` → only `[8080/tcp:[{127.0.0.1 8080}]]`.
  3. `docker exec cloned-localai id -u` → `65532`.
  4. `docker exec cloned-localai sh -c 'touch /tmp/test && rm /tmp/test'` (works) and `docker exec cloned-localai sh -c 'touch /etc/test'` (fails).

Hardening Options
- Run connectors out‑of‑process with no ambient secrets and a minimal env (planned container runner uses the same security knobs as LocalAI above).
- Route all HTTP egress through a local allowlist proxy (Envoy/Squid/Traefik) and restrict containers to that network; firewall CLI/API will manage the allowlist for both SafeFetch and the proxy.
- Use Docker security_opt (`no-new-privileges`), `read_only` rootfs, tmpfs overlays, `cap_drop: [ALL]`, and explicit uid/gid assignments for every service.
- Bind UI/API to loopback only; enforce strict CSP; require device pairing.

Firewall Workflow
- List: npm run cli -- firewall list
- Allow per‑tool: npm run cli -- firewall allow --tool cloned.mcp.web.search@v1 api.search.brave.com
- Allow global: npm run cli -- firewall allow api.duckduckgo.com
- Remove: npm run cli -- firewall remove --tool cloned.mcp.web.search@v1 api.search.brave.com
- Programmatic (approval‑gated): tool cloned.internal.security.egress.update@v1

Connector Sandbox Runner (v1)
- Run any pipeline with `--sandbox container` to force connectors/tools into Docker: `npm run cli -- run pipeline.research.report --sandbox container`.
- Requirements: Docker Engine 24+, `npm run build` (so `/workspace/dist/runtime/container/worker.js` exists), and the repo mounted read-only inside the container. The runner uses `node:20-alpine`, UID `node`, `read_only` rootfs, tmpfs `/tmp`, `cap_drop=ALL`, `no-new-privileges`, `pids_limit=256`, `--cpus`/`--memory` throttles, and bind-mounts a per-call scratch dir at `/sandbox`.
- Networks: By default containers attach to Docker's `bridge`. Override with `CLONED_SANDBOX_NETWORK` or `new DockerContainerRunner({ network: ... })` if you want a dedicated egress VLAN.
- Proxying: Set `cloned firewall proxy --set http://127.0.0.1:8081` (stored in `.cloned/config.yaml`) or export `CLONED_EGRESS_PROXY`. The sandbox exports `HTTP_PROXY`/`HTTPS_PROXY` to that value so every HTTP call goes through your local inspection/proxy tier.
- Verification tips:
  1. `npm run cli -- run pipeline.research.report --sandbox container --dry-run` (still executes handlers) and `docker ps` to see `cloned_tool_*` containers.
  2. `docker inspect cloned_tool_* --format '{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}}'` → `true [ALL] [no-new-privileges:true]`.
  3. Inspect mounts: `docker inspect ... --format '{{json .Mounts}}'` shows `/workspace` (ro) + `/sandbox` (rw temp).
  4. Proxy status: `npm run cli -- firewall proxy` to view workspace proxy + env override + effective URL.
