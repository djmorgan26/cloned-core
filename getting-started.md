# Getting Started with Cloned

This guide walks you through installing, initializing, and running your first pipeline.

---

## Prerequisites

- **Node.js 20+** – check with `node --version`
- **npm 9+** – bundled with Node.js
- Access to an **OpenAI-compatible LLM endpoint** – this can be a hosted provider (OpenAI, Azure OpenAI, Groq, Together, etc.), the hardened LocalAI Docker stack, or a local runtime such as Ollama. The setup wizard will guide you through whichever option fits your hardware and security posture.

## Bring your own connector credentials

`cloned connect github` and `cloned connect youtube` expect you to supply client credentials from your own OAuth apps:

- **GitHub:** create a GitHub App, note its client ID, and export `GITHUB_CLIENT_ID`. The CLI walks you through the OAuth device flow and saves the resulting user token into the vault, but GitHub App installation state is not automated yet—you still need to manually install/activate the app per the on-screen instructions.
- **YouTube:** create an OAuth client (installed application), export `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET`, then run the device flow. The runtime only supports assist mode right now, so uploads remain blocked even after auth.

Those client IDs/secrets never touch git or logs; they live only in your local terminal environment and the vault file.

---

## Installation

```bash
# Clone or download the repo, then install dependencies:
npm install
```

Optionally install globally so `cloned` is available anywhere:
```bash
npm install -g .
```

Otherwise prefix all commands with `npx`:
```bash
npx cloned --version
```

> **Workspace scope:** Run all `cloned` commands from the directory that contains your `.cloned/` workspace. Installing globally (`npm install -g .`) simply saves you from typing `npx`, but the CLI still inspects the current working directory for `.cloned/`. You do **not** need Docker just to run the CLI—Docker only comes into play when you opt into sandboxed connector execution—but we still recommend dockerizing Cloned for production/hardened setups, and the setup wizard will warn you when you’re running outside a container.

---

## Setup wizard (recommended)

Run the guided wizard to walk through workspace initialization, doctor checks, and Azure Key Vault configuration in a single session:

```bash
cloned setup
```

The wizard shows one step at a time and lets you skip, rerun, or jump directly to a later step (e.g., rerun it tomorrow just to reconnect Azure). When prerequisites are missing it blocks progress with friendly guidance ("install Docker first"), and the doctor step now has built-in fixers—approve a prompt to `chmod 700 .cloned`, rebuild `better-sqlite3`, or walk through the new LLM provider wizard without leaving the flow. Pick the Docker option at the start to unlock the "Launch Docker stack" step, which runs `docker compose -f docker/compose.local-llm.yaml up -d` for you, tears it down on demand, and prints the `LLM_API_BASE`/`LLM_API_KEY` exports required to point Cloned at the loopback LocalAI container. The LLM provider wizard reuses that state, automatically detecting if the LocalAI container is online, checking whether Ollama is already installed, and offering to install Ollama plus starter models (Meta Llama 3, Mistral Small) when it is not. The UI onboarding will mirror this exact checklist so both humans and AI assistants can follow the same remediation path.

> Run `cloned setup`, `cloned doctor`, or `cloned vault bootstrap azure --interactive` from any directory that contains the `.cloned/` workspace you want to operate on. Installing the CLI globally (`npm install -g .`) means you can type `cloned setup` from anywhere; during development you can stick with `npx` inside the repo root.

---

## Step 1: Initialize a workspace

```bash
cloned init --type personal
```

This creates a `.cloned/` directory in the current working directory with:

```
.cloned/
  config.yaml       # Workspace configuration
  state.db          # SQLite database (runs, approvals, budgets, pairings)
  audit.log         # Append-only chain-hashed audit log
  registry.yaml     # Installed connectors registry
  trust/            # Connector publisher trust roots
  artifacts/        # Pipeline output files
  vault.dev.json    # Dev vault (plaintext – for development only)
```

---

## Step 2: Run a health check

```bash
cloned doctor
```

Expected output on a fresh install:

```
✓ Node.js >= 20     Node.js 20.x.x
✓ npm available     npm found
✓ Workspace initialized (.cloned/)
✓ Config file present
✓ State DB present
✓ SQLite WAL mode enabled
✓ Registry present
⚠ Audit log present     (will be created on first action)
⚠ LLM API key configured   (required for synthesis)
...
```

Fix any failures before proceeding.

---

## Step 3: Configure your LLM provider

The `cloned setup → Run doctor checks → Guide me through a fix → LLM API key configured` flow now asks which provider you plan to use:

- **OpenAI** – paste your API key and the wizard stores both `llm.api_key` and `llm.api_base=https://api.openai.com/v1`.
- **Azure OpenAI** – enter your resource, deployment, and API version; the wizard builds the correct deployment URL (with `?api-version=...`) and stores it alongside your key.
- **LocalAI (Docker)** – if you launched the docker stack in the previous step the wizard confirms the container is reachable, inserts the default `LLM_API_BASE=http://127.0.0.1:8080/v1`, and saves a placeholder key (`local-dev`).
- **Ollama** – the wizard checks whether the CLI is installed, optionally installs it via Homebrew, prompts you to pull starter models, and sets `llm.api_base=http://127.0.0.1:11434/v1` so pipelines can hit your local runtime.
- **Custom OpenAI-compatible** – great for providers like Groq, Together, LM Studio, or anything else that implements the `/chat/completions` contract.

> Tip: type `:back` at any secret prompt to return to the provider list, or press `Ctrl+C` to abort the wizard safely after the current step completes.

Prefer a manual workflow? You can still run vault commands directly:

```bash
# OpenAI (or any hosted OpenAI-compatible):
cloned vault set llm.api_key sk-...
cloned vault set llm.api_base https://api.openai.com/v1

# Azure OpenAI (resource "contoso-ai", deployment "gpt-4o-mini"):
cloned vault set llm.api_key <azure-openai-key>
cloned vault set \
  llm.api_base \
  "https://contoso-ai.openai.azure.com/openai/deployments/gpt-4o-mini?api-version=2024-02-15-preview"

# LocalAI docker stack launched by cloned setup:
cloned vault set llm.api_key local-dev
cloned vault set llm.api_base http://127.0.0.1:8080/v1

# Ollama (local runtime on port 11434):
cloned vault set llm.api_key ollama-local
cloned vault set llm.api_base http://127.0.0.1:11434/v1
```

All secrets live inside `.cloned/vault.*`. They never hit git or the API responses.

---

## Step 4: Onboard (optional – interactive blueprint selection)

```bash
cloned onboard
```

You'll be asked for your primary goal. Cloned will:
1. Select a matching blueprint (researcher, creator, builder, legal_research)
2. Show the required capabilities and connectors
3. Generate a Plan of Record in `.cloned/plans/<blueprint>.md`
4. Show which connectors are already connected and which need `cloned connect`

Skip this step if you want to run a pipeline directly.

---

## Step 5: Run the researcher pipeline

```bash
cloned run pipeline.research.report --topic "solar energy storage breakthroughs 2025"
```

This pipeline:
1. Searches DuckDuckGo for your topic (no API key needed)
2. Calls your LLM to synthesize a cited markdown report
3. Saves the report to `.cloned/artifacts/`

Output:
```
Running pipeline: Deep Research Report
  ✓ step.search (cloned.mcp.web.search@v1): success
  ✓ step.synthesize (cloned.internal.synthesis@v1): success
  ✓ step.save_artifact (cloned.internal.artifact.save@v1): success

Run completed: succeeded
Run ID: abc123...

Artifacts saved:
  /path/to/.cloned/artifacts/abc123-research-report.md
```

---

## Step 6: Start the Command Center UI

```bash
cloned serve
```

Open [http://127.0.0.1:7800](http://127.0.0.1:7800) in your browser.

> **Device pairing note:** once you approve a pairing (via the Pairings API), every UI/API request must include `X-Device-Id`. The SPA does not send that header yet, so leave at least one device pending while you explore the UI, or call API endpoints manually with `curl -H "X-Device-Id: <approved-device-id>" ...` until the pairing UX ships.

The dashboard shows:
- **Overview** – workspace info, budget bars, recent runs
- **Runs** – full history; start new pipelines from the UI
- **Approvals** – approve or deny queued high-risk actions
- **Budgets** – usage per category with visual bars
- **Connectors** – enable/disable installed connectors
- **Secrets** – vault status (names only, no values ever shown)
- **Doctor** – live environment check results
- **Pairings** – register and manage device pairings

---

## Connecting GitHub

```bash
export GITHUB_CLIENT_ID=your_github_app_client_id
cloned connect github
```

Follow the prompts to:
1. Open the GitHub device authorization URL
2. Enter the displayed code
3. Wait for the CLI to detect authorization
4. Token is stored in vault automatically

The CLI stops after the OAuth bootstrap. Use the URL it prints to manually install/activate your GitHub App—registry state transitions and installation webhooks are on the roadmap, so treat this flow as "get a user token into the vault" for now. Once the GitHub App pieces land, the existing tools (`github.issue.create`, `github.pr.create`) will automatically start using installation tokens instead of the user token.

---

## Connecting YouTube (assist mode)

```bash
export YOUTUBE_CLIENT_ID=your_google_client_id
export YOUTUBE_CLIENT_SECRET=your_google_client_secret
cloned connect youtube
```

YouTube runs in **assist mode by default** – it will generate video packages but will **not** upload (there is no upload handler registered yet). Treat the resulting artifact as a draft package that you can inspect or hand off for manual publishing.

```bash
# Run the creator pipeline
cloned run pipeline.creator.youtube --input '{"topic":"AI tools for developers","title":"Top AI Dev Tools 2025","description":"A roundup of the best AI tools...","tags":["AI","developers","tools"]}'

# Upload automation is not wired yet, so approval prompts are informational only.
```

---

## Azure Key Vault (production)

Use the Azure Key Vault provider when you need real secrets hygiene. Run the bootstrap helper to generate an exact script (AI-friendly via `--output json`):

```bash
# Tailor the plan to your workspace (names can be overridden)
cloned vault bootstrap azure \
  --vault-name my-cloned-vault \
  --resource-group rg-cloned-prod \
  --location eastus

# Prefer the interactive wizard if you want the CLI to prompt after each step
cloned vault bootstrap azure --interactive

# Prefer machine-readable output for AI agents:
cloned vault bootstrap azure --output json > azure-plan.json
```

The helper prints the Azure CLI commands you run in your own tenant. When it asks for a "Service principal display name" you can enter a new label or reuse the name of an existing Azure AD app—step 3 below simply needs a value to feed into `az ad sp create-for-rbac`. The wizard now ensures your CLI is authenticated (it will launch `az login --use-device-code` if needed) *before* it asks for anything, and then it enumerates existing Key Vaults in the detected subscription so you can adopt one with a single selection. If you pick an existing vault the creation steps are skipped automatically, but you can opt to create something new just as easily. Expired tokens are handled too: if Azure CLI returns an `az login` prompt mid-run, the wizard keeps you in-place and guides you through the device-code flow.

1. `az group create --name <resource-group> --location <region>`
2. `az keyvault create --name <vault-name> --resource-group <resource-group> --location <region> --enable-rbac-authorization true`
3. `az ad sp create-for-rbac --name <app-name> --role "Key Vault Secrets Officer" --scopes /subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.KeyVault/vaults/<vault-name>` (or reuse an existing principal with the same name and role assignment)
4. Export the credentials the command prints (see table below).
5. `cloned vault provider azure`
6. `cloned vault status` (verifies connectivity without ever showing secret values)

In interactive mode the CLI walks you through steps 1–4 (confirming each), asks for the `appId/tenant/password` you just received, and then runs steps 5–6 automatically so you finish with a verified Azure Key Vault. If the Azure CLI is installed locally you can let the wizard launch each `az` command for you; it will even capture the JSON output from `az ad sp create-for-rbac` so the credentials are filled in automatically. Otherwise you can continue running the commands manually in Cloud Shell or a separate terminal.

| Variable | Where it comes from | Example |
| --- | --- | --- |
| `AZURE_KEYVAULT_URI` | `https://<vault-name>.vault.azure.net/` (same as the vault you created) | `https://my-cloned-vault.vault.azure.net/` |
| `AZURE_CLIENT_ID` | `appId` field from step 3 output | `6f8198b0-...` |
| `AZURE_TENANT_ID` | `tenant` field from step 3 output | `72f988bf-...` |
| `AZURE_CLIENT_SECRET` | `password` field from step 3 output (store in your password manager) | `abc123...` |

Install the optional SDKs if they are not already present:

```bash
npm install @azure/keyvault-secrets @azure/identity
```

DefaultAzureCredential honors `az login`, workload identity, or the exported client ID/secret. No Azure secrets ever leave your machine; the helper simply prints commands for you to run.

---

## Dry run mode

Test any pipeline without executing real actions:

```bash
cloned run pipeline.research.report --topic "test" --dry-run
```

Dry-run still executes the real tool handlers; it simply short-circuits approvals and budget debits. To keep the run entirely offline you must stub/memoize the handlers yourself.

---

## Troubleshooting

**`No handler registered for tool`** – you're running a pipeline without tool handlers registered. Make sure you're using the `cloned run` command (not calling the runner directly), which calls `registerBuiltinTools()` automatically.

**`Egress blocked`** – a tool tried to call a domain not in the policy allowlist. Check `policy/packs/personal.yaml` and add the domain to `egress_by_tool`.

**`LLM API error 401`** – your API key is invalid or expired. Run `cloned vault set llm.api_key <new-key>`.

**`Device pairing required`** – once you have an approved pairing in the database, all API calls need an `X-Device-Id` header. Register your device via the Pairings page in the Command Center UI.
