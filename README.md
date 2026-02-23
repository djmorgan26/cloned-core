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
- **Local containers, hardened** – LocalAI compose file runs as non-root, read-only, loopback-bound, and connectors can run inside the sandboxed Docker runner (`--sandbox container`) with optional HTTP proxy control (see [docs/runtime/containers.md](docs/runtime/containers.md)).

---

## Quick start

**Prerequisites:** Node.js 20+, npm

```bash
# 1. Install dependencies
npm install

# 2. Run the setup wizard (workspace → doctor → Azure vault)
npx cloned setup

# 3. Configure your LLM provider (OpenAI, Azure OpenAI, LocalAI, Ollama, custom)
# Use the wizard's doctor → "LLM API key" fixer or run the vault commands directly:
npx cloned vault set llm.api_key sk-...

# 4. Run a research report
npx cloned run pipeline.research.report --topic "solar energy storage breakthroughs"

# 5. Start the Command Center UI (separate terminal)
npx cloned serve
# Open http://127.0.0.1:7800
```

`cloned setup` is resumable—rerun it anytime and jump directly to the step you need (e.g., skip init and go straight to Azure Key Vault). The wizard opens with a system check (Node/npm/Docker, CPU/RAM) and defaults to the Docker install path. When doctor finds a problem it now offers guided fixes (e.g., run `chmod 700 .cloned`, rebuild `better-sqlite3`, configure your LLM provider) instead of dumping errors and leaving you stuck, so humans and AI assistants follow the exact same remediation flow. Choosing Docker mode inserts a "Launch Docker stack" step that runs `docker compose -f docker/compose.local-llm.yaml up -d` for you and prints the `LLM_API_BASE`/`LLM_API_KEY` exports needed for the hardened LocalAI container. The LLM provider fixer then lets you pick OpenAI, Azure OpenAI, LocalAI, Ollama, or any custom OpenAI-compatible endpoint—complete with LocalAI container detection, Ollama auto-install/model prompts, and hardware guidance so non-technical users can still get through setup. Press `Ctrl+C` at any point and the wizard finishes the in-flight step (if any), prints your current status, and exits so you can safely resume later.

> **Workspace scope:** Every command reads the workspace in the **current working directory**. Run the CLI from the folder that contains `.cloned/` (or `npx cloned init` will create it there). You can install the package globally (`npm install -g .`) or invoke it with `npx`, but the commands always act on the cwd—no Docker shell required unless you explicitly use the container sandbox. That applies to `cloned vault bootstrap azure --interactive` too: run it (or `cloned setup`) from whichever directory owns the `.cloned/` workspace you want to change. For hardened deployments we still recommend running inside Docker (`docs/docker/README.md`); the setup wizard warns when you run it outside a container and encourages you back onto the containerized path.

See [getting-started.md](./getting-started.md) for a full walkthrough.


Planning and Status
- All planning docs are indexed at [docs/plan/README.md](docs/plan/README.md) (workplan, acceptance tests, security, integration).

## Current readiness

- ✅ **Researcher pipeline** runs end-to-end once you set `llm.api_key`; the CLI registers built-in tools automatically before each run, so `cloned run pipeline.research.report --topic "..."` produces a cited markdown artifact.
- ⚠️ **Connector onboarding** currently stops after storing OAuth tokens in the vault. Registry records, DB state transitions, and YouTube upload orchestration are still TODO, so treat `cloned connect github|youtube` as auth helpers rather than full lifecycle managers.
- ⚠️ **Creator/builder pipelines** reference future tools (`cloned.internal.scaffold.*`, `cloned.mcp.youtube.video.upload@v1`). They remain in "assist"/planning mode until those handlers ship; do not expect publishing automation yet.
- ⚠️ **Command Center UI** works while the API is in bootstrap mode (no approved device pairings). After you approve a device, every request must include `X-Device-Id`, but the current SPA does not send that header. Keep at least one pairing pending or access the API via curl/Postman with the header until the UI pairing flow lands.
- ⚠️ **`--dry-run`** still executes real tool handlers (it only bypasses approvals/budgets). Keep firewall allowlists tight even in dry-run mode, and use mocks if you need a truly offline rehearsal.

## Gateway / isolation roadmap

Cloned inherited the "gateway" inspiration from OpenClaw: every outbound HTTP call already passes through `SafeFetch`, which enforces per-tool allowlists and records audit entries. The Docker-based connector sandbox + proxy plumbing now ships behind `--sandbox container`; the remaining roadmap items (optional dedicated proxy container + port governance doctor) live in [docs/plan/v1-container-security-plan.md](docs/plan/v1-container-security-plan.md).

---

## CLI commands

| Command | Description |
|---------|-------------|
| `cloned init [--type personal\|shared\|enterprise]` | Initialize workspace in current directory |
| `cloned doctor` | Check environment and diagnose issues |
| `cloned setup` | Interactive onboarding wizard (init → doctor → Azure vault) |
| `cloned onboard [--goal "..."]` | Interactive blueprint selection |
| `cloned run <pipeline> [--topic "..."] [--dry-run] [--sandbox container]` | Run a pipeline (optionally inside the Docker sandbox) |
| `cloned connect github` | Connect GitHub via OAuth device flow |
| `cloned connect github --complete-install --installation-id <id> --app-id <appId> --private-key-path <pem>` | Record GitHub App installation + store credentials in the vault |
| `cloned connect youtube` | Connect YouTube via OAuth device flow |
| `cloned vault status` | Show which provider is active and list secret references |
| `cloned vault set <key> <value>` | Store a secret in the vault |
| `cloned vault provider <dev\|file\|azure>` | Switch the workspace vault backend |
| `cloned vault bootstrap azure [--interactive] [--output json]` | Generate Azure CLI steps (wizard mode available) + env exports for BYO Key Vault |
| `cloned approvals list` | View pending approvals |
| `cloned serve` | Start the API server + Command Center UI |
| `cloned firewall proxy [--set <url> | --clear]` | Inspect or configure the HTTP proxy used by sandboxed connectors |

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
blueprints/     # researcher.yaml, creator.yaml, builder.yaml, legal_research.yaml
policy/packs/   # personal.yaml, shared.yaml, enterprise.yaml
schemas/        # JSON schemas for workspace, connector, audit, blueprint, tool
state/          # SQLite schema (runs, approvals, audit, budgets, pairings)
docs/           # All human-readable docs (plan, runtime, security, connectors, ...)
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
