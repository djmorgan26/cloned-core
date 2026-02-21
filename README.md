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
