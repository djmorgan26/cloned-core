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
