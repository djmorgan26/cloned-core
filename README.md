# Cloned

**Local-first agent operating system.** Run AI agent pipelines on your machine with full governance, audit trails, and zero cloud dependencies.

```
npm install
cloned init
cloned doctor
cloned run pipeline.research.report --topic "your topic"
```

---

## What it does

Cloned lets you run AI-powered pipelines (research, content creation, GitHub automation) with:

- **Governance by default** – every tool call goes through budget checks, approval queues, and egress enforcement before it executes
- **Vault-first secrets** – tokens and API keys never appear in logs or state; stored in a local file vault (or Azure Key Vault for production)
- **Audit trail** – append-only chain-hashed log so you can verify no entries were tampered with
- **Signed connectors** – connectors are installed from a registry with Ed25519 signature verification
- **Command Center UI** – React dashboard at `http://127.0.0.1:7800` to observe runs, manage approvals, and review budgets
- **Local containers, hardened** – LocalAI compose file runs as non-root, read-only, loopback-bound (see RUNTIME/containers.md). Upcoming work: containerized connector runner + egress proxy (PLAN/v1_container_security_plan.md).

---

## Quick start

**Prerequisites:** Node.js 20+, npm

```bash
# 1. Install dependencies
npm install

# 2. Initialize a workspace
npx cloned init --type personal

# 3. Check environment health
npx cloned doctor

# 4. Set your LLM API key (required for researcher pipeline)
npx cloned vault set llm.api_key sk-...

# 5. Run a research report
npx cloned run pipeline.research.report --topic "solar energy storage breakthroughs"

# 6. Start the Command Center UI (separate terminal)
npx cloned serve
# Open http://127.0.0.1:7800
```

See [GETTING_STARTED.md](./GETTING_STARTED.md) for a full walkthrough.

Planning and Status
- All planning docs are indexed at PLAN/README.md (workplan, acceptance tests, security, integration).

## Current readiness

- ✅ **Researcher pipeline** runs end-to-end once you set `llm.api_key`; the CLI registers built-in tools automatically before each run, so `cloned run pipeline.research.report --topic "..."` produces a cited markdown artifact.
- ⚠️ **Connector onboarding** currently stops after storing OAuth tokens in the vault. Registry records, DB state transitions, and YouTube upload orchestration are still TODO, so treat `cloned connect github|youtube` as auth helpers rather than full lifecycle managers.
- ⚠️ **Creator/builder pipelines** reference future tools (`cloned.internal.scaffold.*`, `cloned.mcp.youtube.video.upload@v1`). They remain in "assist"/planning mode until those handlers ship; do not expect publishing automation yet.
- ⚠️ **Command Center UI** works while the API is in bootstrap mode (no approved device pairings). After you approve a device, every request must include `X-Device-Id`, but the current SPA does not send that header. Keep at least one pairing pending or access the API via curl/Postman with the header until the UI pairing flow lands.
- ⚠️ **`--dry-run`** still executes real tool handlers (it only bypasses approvals/budgets). Keep firewall allowlists tight even in dry-run mode, and use mocks if you need a truly offline rehearsal.

## Gateway / isolation roadmap

Cloned inherited the "gateway" inspiration from OpenClaw: every outbound HTTP call already passes through `SafeFetch`, which enforces per-tool allowlists and records audit entries. The longer-term containerized gateway (sandboxed connectors, policy-aware proxy, and port governance) is being tracked in [PLAN/v1_container_security_plan.md](PLAN/v1_container_security_plan.md). That document spells out the LocalAI hardening (now implemented) plus the upcoming out-of-process connector runner and firewall integration.

---

## CLI commands

| Command | Description |
|---------|-------------|
| `cloned init [--type personal\|shared\|enterprise]` | Initialize workspace in current directory |
| `cloned doctor` | Check environment and diagnose issues |
| `cloned onboard [--goal "..."]` | Interactive blueprint selection |
| `cloned run <pipeline> [--topic "..."] [--dry-run]` | Run a pipeline |
| `cloned connect github` | Connect GitHub via OAuth device flow |
| `cloned connect youtube` | Connect YouTube via OAuth device flow |
| `cloned vault set <key> <value>` | Store a secret in the vault |
| `cloned approvals list` | View pending approvals |
| `cloned serve` | Start the API server + Command Center UI |

---

## Built-in pipelines

| Pipeline ID | What it does |
|-------------|--------------|
| `pipeline.research.report` | Web search + LLM synthesis → markdown report in `.cloned/artifacts/` |
| `pipeline.creator.youtube` | Research + video package generation (assist mode, no upload without approval) |
| `pipeline.builder.scaffold` | Repository scaffolding and security checks |

---

## Architecture

```
src/
  cli/          # Commander-based CLI (init, run, onboard, connect, vault, doctor, serve)
  api/          # Fastify REST API (/v1/*) with device pairing enforcement
  runtime/      # Pipeline runner, egress enforcement, skill packs, tool handlers
  governance/   # Policy packs, approval queue, budget tracking
  audit/        # Append-only chain-hashed audit log
  vault/        # Pluggable vault (file-backed dev, Azure KV production)
  connector/    # Registry, signing, GitHub and YouTube connectors
  capability/   # Capability graph: goal → connector mapping
  blueprint/    # Blueprint engine + Plan of Record generation
  workspace/    # Init, config, SQLite DB, paths
ui/             # React + Vite Command Center (Overview, Runs, Approvals, Budgets, ...)
BLUEPRINTS/     # researcher.yaml, creator.yaml, builder.yaml, legal_research.yaml
POLICY/packs/   # personal.yaml, shared.yaml, enterprise.yaml
SCHEMAS/        # JSON schemas for workspace, connector, audit, blueprint, tool
STATE/          # SQLite schema (runs, approvals, audit, budgets, pairings)
```

---

## Security model

- **Egress default-deny** – outbound HTTP only to explicitly allowlisted domains per policy
- **Device pairing** – API requires an approved device ID once any pairing exists
- **Loopback bind** – server binds to `127.0.0.1` by default; non-loopback triggers a warning
- **No secrets in logs** – all log entries are redacted; vault returns names only, never values
- **Approval gating** – high-risk operations (publishing, high-cost API calls) queue an approval before executing

---

## License

MIT
