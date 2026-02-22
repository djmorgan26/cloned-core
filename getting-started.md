# Getting Started with Cloned

This guide walks you through installing, initializing, and running your first pipeline.

---

## Prerequisites

- **Node.js 20+** – check with `node --version`
- **npm 9+** – bundled with Node.js
- An **LLM API key** (OpenAI-compatible) for the synthesis step; get one at [platform.openai.com](https://platform.openai.com)

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

## Step 3: Configure your LLM API key

```bash
cloned vault set llm.api_key sk-...
```

The key is stored in `.cloned/vault.dev.json`. It is never logged or returned by the API.

To use a custom LLM endpoint (e.g., a local Ollama server):
```bash
cloned vault set llm.api_base http://localhost:11434/v1
```

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

For production use, store secrets in Azure Key Vault instead of the local file:

```bash
# Install the optional Azure packages
npm install @azure/keyvault-secrets @azure/identity

# Set vault URI (use your actual vault name)
export AZURE_KEYVAULT_URI=https://my-vault.vault.azure.net/

# Switch provider (uses DefaultAzureCredential – works with az login, managed identity, etc.)
cloned vault set --provider azure
```

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
