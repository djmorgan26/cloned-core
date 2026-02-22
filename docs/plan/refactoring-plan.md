---
title: "Refactoring & Optimization Plan"
description: "Exact implementation plan for all identified bugs, duplications, type gaps, and performance issues."
audience: [developers]
category: plan
---

# Refactoring & Optimization Plan

Derived from a full audit of the codebase (2026-02-22). Issues are grouped into logical work tracks that can be executed sequentially or in parallel by different contributors. Each item has an exact description of what to change, in which file, and why.

Cross-reference: All changes must continue to pass `v1-acceptance-tests.md` and CI (lint, typecheck, tests).

---

## Track 1 — Bug Fixes (P0, unblock everything else)

These are correctness issues that can cause crashes, data corruption, or silent misbehavior. Fix before any other track.

### 1.1 Fix `jsonHash()` crash on null/non-object input
**File:** `src/shared/redact.ts:37`

Current code:
```ts
export function jsonHash(obj: unknown): string {
  const canonical = JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
```

`Object.keys(null)` throws `TypeError`. Fix by guarding the replacer:
```ts
export function jsonHash(obj: unknown): string {
  const replacer =
    obj !== null && typeof obj === 'object' && !Array.isArray(obj)
      ? Object.keys(obj as Record<string, unknown>).sort()
      : undefined;
  const canonical = JSON.stringify(obj, replacer);
  return createHash('sha256').update(canonical).digest('hex');
}
```

Add test in `src/__tests__/redact.test.ts`:
- `jsonHash(null)` does not throw
- `jsonHash("string")` does not throw
- `jsonHash({ b: 2, a: 1 })` returns same hash as `jsonHash({ a: 1, b: 2 })`

---

### 1.2 Fix `openDb()` silently ignoring path after first open
**File:** `src/workspace/db.ts:11-28`

The singleton pattern ignores the `dbPath` argument on subsequent calls, silently returning the wrong database. Two options — implement option A:

**Option A (preferred): Remove the singleton, let callers own the instance.**
```ts
// Remove: let _db: Database.Database | null = null;

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  try {
    const sql = readFileSync(SCHEMA_SQL, 'utf8');
    db.exec(sql);
  } catch {
    applyInlineSchema(db);
  }
  return db;
}

// Remove getDb() and closeDb() — callers hold the reference
```

Update every call site that uses `getDb()` to use the returned instance from `openDb()`. The server (`src/api/server.ts:44`) and CLI run command (`src/cli/commands/run.ts`) are the two entry points.

**Option B (fallback if refactor is too large):** Throw if called with a different path:
```ts
export function openDb(dbPath: string): Database.Database {
  if (_db) {
    if (_currentPath !== dbPath) throw new Error(`DB already opened at ${_currentPath}, cannot reopen at ${dbPath}`);
    return _db;
  }
  // ...
}
```

Acceptance: `src/__tests__/` — test that opening two different paths in one process does not silently share state.

---

### 1.3 Fix budget TOCTOU race — wrap check+record in a transaction
**File:** `src/governance/budgets.ts`

`checkBudget()` and `recordBudgetUsage()` are called separately in `runner.ts:203-208,231`. Between these two calls another concurrent step could consume budget. Fix by combining into a single transactional function:

```ts
/**
 * Atomically check budget and record usage if allowed.
 * Returns the same BudgetCheckResult shape.
 */
export function checkAndRecordBudget(
  db: Database.Database,
  workspaceId: string,
  cost: CostEstimate,
): BudgetCheckResult {
  return db.transaction(() => {
    const result = checkBudget(db, workspaceId, cost);
    if (result.allowed) {
      recordBudgetUsage(db, workspaceId, cost);
    }
    return result;
  })();
}
```

Update `src/runtime/runner.ts:200-208` and `src/runtime/runner.ts:230-232` to call `checkAndRecordBudget()` once instead of the two separate calls. Remove the standalone `recordBudgetUsage()` call in runner.ts (keep the export for other callers that may need it).

---

### 1.4 Fix `selectBlueprint()` returning a result on zero keyword match
**File:** `src/blueprint/engine.ts:51-77`

When no user goal keywords match any blueprint, `bestScore` stays at `-1` and the function returns the first blueprint. Fix:

```ts
export function selectBlueprint(blueprints: Blueprint[], goals: string[]): Blueprint | null {
  if (blueprints.length === 0) return null;

  let bestScore = 0; // changed from -1 to 0 — must have at least one match
  let best: Blueprint | null = null;

  for (const bp of blueprints) {
    // ... scoring logic unchanged ...
    if (score > bestScore) {
      bestScore = score;
      best = bp;
    }
  }

  return best; // returns null when no keywords matched
}
```

Update `src/cli/commands/onboard.ts` to handle the `null` case with a useful message: "No blueprint matched your goal. Available blueprints: ..."

Add test in `src/__tests__/` covering: no match returns null; partial match returns best; exact match returns correct blueprint.

---

### 1.5 Fix cycle detection in `resolveCapabilities()`
**File:** `src/capability/graph.ts:117-138`

The recursive `resolve()` function will infinite-loop with circular prerequisites. Add a `visiting` set:

```ts
export function resolveCapabilities(graph: CapabilityGraph, required: string[]): string[] {
  const resolved = new Set<string>();
  const visiting = new Set<string>(); // cycle guard

  function resolve(id: string) {
    if (resolved.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Circular capability prerequisite detected: ${id}`);
    }
    visiting.add(id);
    const node = graph.capabilities.get(id);
    if (node) {
      for (const prereq of node.capability.prerequisites) {
        resolve(prereq);
      }
    }
    visiting.delete(id);
    resolved.add(id);
  }

  for (const id of required) resolve(id);
  return Array.from(resolved);
}
```

Add test: a graph with `A -> B -> A` should throw rather than hang.

---

### 1.6 Implement `POST /v1/runs` — remove stub
**File:** `src/api/routes/runs.ts:36-58`

The endpoint currently returns `202 Accepted` without creating any record or executing anything. This must call `runPipeline()` or enqueue a run properly. The minimal fix that matches current architecture:

```ts
fastify.post('/v1/runs', async (req, reply) => {
  const ws = opts.config?.workspace_id ?? 'default';
  const body = req.body as { pipeline_id?: string; dry_run?: boolean; vars?: Record<string, unknown> };

  if (!body.pipeline_id) {
    return reply.status(400).send({ error: 'pipeline_id is required' });
  }

  const pipeline = BUILT_IN_PIPELINES[body.pipeline_id];
  if (!pipeline) {
    return reply.status(404).send({ error: `Pipeline not found: ${body.pipeline_id}` });
  }

  const config = opts.config;
  if (!config) return reply.status(503).send({ error: 'Workspace not initialized' });

  const policy = loadPolicyPack(config.policy_pack, opts.paths.policyDir);
  const result = await runPipeline(pipeline, {
    db: opts.db,
    workspaceId: ws,
    policy,
    actor: 'api',
    dryRun: body.dry_run ?? false,
    cwd: opts.paths.root,
    vars: body.vars,
  });

  return reply.status(202).send(result);
});
```

Note: this runs synchronously in the request handler. For long pipelines a proper job queue is the right answer (future work), but this removes the stub.

---

## Track 2 — Type Safety & Validation (P1)

### 2.1 Add Zod schemas for all YAML-loaded structures
**Files:** `src/governance/policy.ts`, `src/workspace/config.ts`, `src/blueprint/engine.ts`

`zod` is already in `package.json`. Create `src/shared/schemas.ts`:

```ts
import { z } from 'zod';

export const WorkspaceConfigSchema = z.object({
  workspace_id: z.string(),
  type: z.enum(['personal', 'shared', 'enterprise']),
  policy_pack: z.string(),
  vault_provider: z.string(),
  created_at: z.string(),
});

export const PolicyPackSchema = z.object({
  pack_id: z.string(),
  tier: z.string(),
  version: z.string(),
  budgets: z.record(z.object({ period: z.string(), cap: z.number() })),
  approvals: z.object({ rules: z.array(z.object({
    match: z.object({
      risk_level: z.string().optional(),
      cost_category: z.string().optional(),
      tool_id: z.string().optional(),
    }),
    requires_approval: z.boolean(),
  })) }),
  allowlists: z.object({
    publishers: z.array(z.string()),
    tools: z.array(z.string()),
    capabilities: z.array(z.string()),
    egress_domains: z.array(z.string()),
    egress_by_connector: z.record(z.array(z.string())),
    egress_by_tool: z.record(z.array(z.string())),
  }),
  ui: z.object({ allowed_origins: z.array(z.string()) }),
});

export const BlueprintSchema = z.object({
  id: z.string(),
  version: z.string(),
  title: z.string(),
  description: z.string(),
  goals: z.array(z.string()),
  required_capabilities: z.array(z.string()),
  preferred_connectors: z.array(z.string()),
  policy_pack: z.string(),
  first_run_pipeline: z.string().optional(),
  manual_steps: z.array(z.string()).optional(),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
export type PolicyPack = z.infer<typeof PolicyPackSchema>;
export type Blueprint = z.infer<typeof BlueprintSchema>;
```

Then update each loader:
- `src/workspace/config.ts:readWorkspaceConfig` — replace `load(raw) as WorkspaceConfig` with `WorkspaceConfigSchema.parse(load(raw))`
- `src/governance/policy.ts:loadBuiltinPack` — replace cast with `PolicyPackSchema.parse(...)`
- `src/blueprint/engine.ts:loadBlueprints` — replace cast with `BlueprintSchema.parse(...)`, log the ZodError if parse fails instead of silently skipping

Remove the separate type definitions from `src/workspace/types.ts` and `src/governance/policy.ts` since Zod infers them now.

---

### 2.2 Replace `AzureKeyVaultProvider any` types with a proper interface
**File:** `src/vault/azure-provider.ts`

Remove the `eslint-disable` comment and `type AnyClient = any`. Define a minimal interface:

```ts
interface SecretClientLike {
  setSecret(name: string, value: string): Promise<unknown>;
  getSecret(name: string): Promise<{ value?: string }>;
  beginDeleteSecret(name: string): Promise<unknown>;
  listPropertiesOfSecrets(): AsyncIterable<{ name: string; updatedOn?: Date }>;
}
```

The dynamic import still returns `unknown`; cast to this interface:
```ts
this._client = new SecretClient(vaultUri, new DefaultAzureCredential()) as SecretClientLike;
```

---

### 2.3 Add typed Fastify route schemas to all API routes
**Files:** All `src/api/routes/*.ts`

Replace untyped body/query casts with Fastify generics:

```ts
// Before:
fastify.get('/v1/approvals', async (req) => {
  const query = req.query as { status?: string };

// After:
fastify.get<{ Querystring: { status?: 'pending' | 'approved' | 'denied' } }>(
  '/v1/approvals',
  async (req) => {
    const { status } = req.query; // typed
```

For request bodies, add Zod validation at the top of each handler where the body is consumed. Do not add Fastify JSON Schema (the TypeScript generics are sufficient without duplicating in JSON Schema form).

---

## Track 3 — Eliminate Duplication (P1)

### 3.1 Extract shared `RouteOpts` type
**New file:** `src/api/types.ts`

```ts
import type Database from 'better-sqlite3';
import type { WorkspaceConfig } from '../shared/schemas.js';
import type { ClonedPaths } from '../workspace/types.js';

export interface RouteOpts {
  db: Database.Database;
  config: WorkspaceConfig | null;
  paths: ClonedPaths;
}

export function getWorkspaceId(config: WorkspaceConfig | null): string {
  return config?.workspace_id ?? 'default';
}
```

Delete the local `interface RouteOpts` from all 8 route files. Replace `opts.config?.workspace_id ?? 'default'` with `getWorkspaceId(opts.config)` throughout.

---

### 3.2 Extract shared chain-hash utility
**New file:** `src/shared/chain-hash.ts`

```ts
import { createHash } from 'node:crypto';

/**
 * Compute a SHA-256 hash of a canonical JSON representation of an entry,
 * chained to the previous entry hash for tamper-evidence.
 */
export function computeChainHash(
  prevHash: string | null,
  fields: Record<string, unknown>,
): string {
  const canonical = JSON.stringify({ ...fields, chain_prev_hash: prevHash });
  return createHash('sha256').update(canonical).digest('hex');
}
```

Update `src/governance/approvals.ts:21-34` and `src/audit/audit.ts:52-67` to import and use `computeChainHash`. Delete both local implementations.

---

### 3.3 Extract CLI workspace initialization helper
**New file:** `src/cli/cli-shared.ts`

```ts
import { getClonedPaths } from '../workspace/paths.js';
import { readWorkspaceConfig } from '../workspace/config.js';
import type { WorkspaceConfig } from '../shared/schemas.js';
import type { ClonedPaths } from '../workspace/types.js';

export interface WorkspaceContext {
  paths: ClonedPaths;
  config: WorkspaceConfig;
}

/**
 * Load workspace config or exit with a clear error.
 * Use at the top of every CLI command that requires an initialized workspace.
 */
export function requireWorkspace(cwd?: string): WorkspaceContext {
  const paths = getClonedPaths(cwd);
  try {
    const config = readWorkspaceConfig(paths.config);
    return { paths, config };
  } catch {
    console.error('Workspace not initialized. Run: cloned init');
    process.exit(1);
  }
}
```

Replace the repeated try/catch pattern in these files (all 7 share it):
- `src/cli/commands/run.ts:33-36`
- `src/cli/commands/connect.ts:16-20`
- `src/cli/commands/onboard.ts:22-26`
- `src/cli/commands/approvals.ts:21-24`, `57-61`, `81-85`
- `src/cli/commands/firewall.ts`

---

### 3.4 Auto-discover blueprints from directory
**File:** `src/blueprint/engine.ts:31-49`

Remove hardcoded `BLUEPRINT_FILES` list. Replace with directory scan:

```ts
export function loadBlueprints(): Blueprint[] {
  if (!existsSync(BLUEPRINTS_DIR)) return [];

  const files = readdirSync(BLUEPRINTS_DIR).filter((f) => f.endsWith('.yaml'));
  const blueprints: Blueprint[] = [];

  for (const file of files) {
    const filePath = join(BLUEPRINTS_DIR, file);
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = BlueprintSchema.parse(load(raw));
      blueprints.push(parsed);
    } catch (err) {
      logger.warn('Skipping malformed blueprint', { file, error: (err as Error).message });
    }
  }

  return blueprints;
}
```

Add `readdirSync` to the import from `node:fs`.

---

### 3.5 Fix `selectConnectors()` to use the graph argument
**File:** `src/capability/graph.ts:144-168`

The function takes `graph: CapabilityGraph` but reads `CONNECTOR_CAPABILITIES` directly, making the abstraction useless. Fix:

```ts
export function selectConnectors(
  graph: CapabilityGraph,
  capabilities: string[],
): { connector: string; covers: string[] }[] {
  const uncovered = new Set(capabilities);
  const selected: { connector: string; covers: string[] }[] = [];

  // Build connector->capabilities index from the graph itself
  const connectorIndex = new Map<string, string[]>();
  for (const [capId, node] of graph.capabilities) {
    for (const connId of node.provided_by) {
      const existing = connectorIndex.get(connId) ?? [];
      existing.push(capId);
      connectorIndex.set(connId, existing);
    }
  }

  while (uncovered.size > 0) {
    let bestConnector = '';
    let bestCoverage: string[] = [];

    for (const [connId, caps] of connectorIndex) {
      const covers = caps.filter((c) => uncovered.has(c));
      if (covers.length > bestCoverage.length) {
        bestConnector = connId;
        bestCoverage = covers;
      }
    }

    if (!bestConnector || bestCoverage.length === 0) break;

    selected.push({ connector: bestConnector, covers: bestCoverage });
    for (const c of bestCoverage) uncovered.delete(c);
  }

  return selected;
}
```

Delete the module-level `CONNECTOR_CAPABILITIES` constant — the data lives on `CapabilityNode.provided_by` which `buildCapabilityGraph()` already populates.

---

## Track 4 — Performance (P2)

### 4.1 Cache pairing bootstrap check in middleware
**File:** `src/api/pairing-middleware.ts`

Currently queries `COUNT(*) FROM pairings` on every request. Use a boolean flag:

```ts
export function registerPairingMiddleware(fastify: FastifyInstance, db: Database.Database): void {
  // Cache: once approved pairings exist, we stay in enforcement mode.
  // A server restart resets the cache (safe — bootstrap mode re-checks DB once).
  let bootstrapMode: boolean | null = null;

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM pairings WHERE status = 'approved'`);
  const lookupStmt = db.prepare(`SELECT status FROM pairings WHERE device_public_key = ? AND status = 'approved'`);

  fastify.addHook('onRequest', async (req, reply) => {
    const routeKey = `${req.method} ${req.url.split('?')[0]}`;
    if (EXEMPT_ROUTES.has(routeKey)) return;

    if (bootstrapMode === null) {
      const { count } = countStmt.get() as { count: number };
      bootstrapMode = count === 0;
    }

    if (bootstrapMode) return;

    const deviceId = req.headers['x-device-id'] as string | undefined;
    if (!deviceId) {
      return reply.status(401).send({ error: 'Device pairing required', message: '...' });
    }

    const pairing = lookupStmt.get(deviceId);
    if (!pairing) {
      return reply.status(401).send({ error: 'Device not approved', message: '...' });
    }
  });

  // Expose a reset hook so the pairing approval route can flip bootstrapMode off
  return {
    onPairingApproved: () => { bootstrapMode = false; },
  };
}
```

Update the pairings approval route (`src/api/routes/pairings.ts`) to call `onPairingApproved()` after the first approval succeeds.

---

### 4.2 Cache policy packs in memory
**New file:** `src/governance/policy-cache.ts`

```ts
import { loadPolicyPack as loadRaw } from './policy.js';
import type { PolicyPack } from '../shared/schemas.js';

const cache = new Map<string, PolicyPack>();

export function loadPolicyPack(packId: string, customDir?: string): PolicyPack {
  const key = `${packId}::${customDir ?? ''}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pack = loadRaw(packId, customDir);
  cache.set(key, pack);
  return pack;
}

/** Invalidate the cache entry after a firewall edit. */
export function invalidatePolicyCache(packId: string, customDir?: string): void {
  cache.delete(`${packId}::${customDir ?? ''}`);
}
```

Update all call sites of `loadPolicyPack` to import from `policy-cache.ts`. Call `invalidatePolicyCache()` in `applyEgressUpdate()` (`src/runtime/tools/index.ts:66`) after writing the YAML file.

---

### 4.3 Remove unnecessary `async` from `initBudgets`
**File:** `src/governance/budgets.ts:42`

```ts
// Before:
export async function initBudgets(...): Promise<void> {

// After:
export function initBudgets(...): void {
```

Update `src/workspace/init.ts:61` to remove the `await`. No other call sites exist.

---

### 4.4 Add `getSecrets(keys)` batch method to `VaultProvider`
**File:** `src/vault/types.ts`

Add to the interface:
```ts
getSecrets?(keys: string[]): Promise<Record<string, string | null>>;
```

Implement in `FileVaultProvider` and `DevVaultProvider` as a simple map over `getSecret`. The Azure provider can parallelize with `Promise.all`. Make it optional (?) so existing providers don't break before they implement it.

Update `src/api/routes/vault.ts:43-48` to use the batch method when `include_values` is requested.

---

## Track 5 — Architecture Cleanup (P2)

### 5.1 Fix `doctor.ts` to use `VaultProvider` instead of reading the file directly
**File:** `src/runtime/doctor.ts:186-210`

The LLM API key check reads `vault.dev.json` directly. Replace with:

```ts
check('LLM API key configured', async () => {
  // Check env vars first (fast path)
  const envKey = process.env['LLM_API_KEY'] ?? process.env['OPENAI_API_KEY'];
  if (envKey) return { status: 'pass', message: 'LLM API key found in environment' };

  // Check vault via provider abstraction
  try {
    const vault = getVaultProvider(`${paths.root}/vault.dev.json`);
    const vaultKey = await vault.getSecret('llm.api_key');
    if (vaultKey) return { status: 'pass', message: 'LLM API key found in vault' };
  } catch {
    // Vault not reachable – fall through to warn
  }

  return {
    status: 'warn',
    message: 'LLM API key not configured (required for synthesis)',
    fix: 'Run: cloned vault set llm.api_key <your-key>  or set LLM_API_KEY env var',
  };
}),
```

Note: `runDoctorChecks()` is currently synchronous. Since one check becomes async, either:
- Make `runDoctorChecks()` return `Promise<DoctorReport>` (preferred, update all callers), or
- Keep the vault check best-effort by using a previously resolved vault status

---

### 5.2 Fix `require()` in ESM — `doctor.ts` SQLite WAL check
**File:** `src/runtime/doctor.ts:117-137`

Replace `require('better-sqlite3')` with a dynamic import or `createRequire`:

```ts
import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);

// Then inside the check:
const BetterSQLite3 = _require('better-sqlite3') as typeof import('better-sqlite3');
```

Move `_require` to the top of the file (module scope) so it's constructed once.

---

### 5.3 Move `TOOL_COSTS` to tool manifests or a side-car registry
**File:** `src/runtime/runner.ts:34-40`

The hardcoded map only covers 3 tools and silently skips budget enforcement for all others. Two steps:

**Step 1 (now):** Log a warning when a tool executes with no cost entry:
```ts
const costEstimate = TOOL_COSTS[step.tool_id] ?? null;
if (!costEstimate) {
  logger.debug('No cost estimate for tool — budget not enforced', { tool: step.tool_id });
}
```

**Step 2 (follow-up):** Add an optional `cost?: { category: string; amount: number }` field to the `SkillStep` type. Connectors that declare costs in their tool manifests set this field; `registerBuiltinTools()` reads from the manifest at registration time. `TOOL_COSTS` becomes the fallback-only map.

---

### 5.4 Decouple module-level singletons for test isolation
**Files:** `src/workspace/db.ts`, `src/vault/index.ts`, `src/vault/dev-provider.ts`

After completing 1.2 (remove db singleton), vault singletons remain. Add reset helpers for tests:

In `src/vault/index.ts`:
```ts
/** For testing only — resets the active provider so a fresh one can be set. */
export function _resetVaultProvider(): void {
  _activeProvider = null;
}
```

In `src/vault/dev-provider.ts`:
```ts
/** For testing only. */
export function _resetDevVault(): void {
  _devVault = null;
}
```

Update `src/__tests__/test-helpers.ts` to call these in `afterEach` or `beforeEach` blocks.

---

### 5.5 Add file locking to `FileVaultProvider`
**File:** `src/vault/file-provider.ts`

The provider writes `JSON.stringify(this.store)` on every `setSecret`. Multiple Node processes on the same vault file will overwrite each other. Add advisory locking:

Install `proper-lockfile` (no external process dependency):
```
npm install proper-lockfile
npm install --save-dev @types/proper-lockfile
```

Update `persist()`:
```ts
private persist(): void {
  const dir = dirname(this.filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    lockSync(this.filePath + '.lock');
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), { encoding: 'utf8', mode: 0o600 });
  } finally {
    unlockSync(this.filePath + '.lock');
  }
}
```

Alternative if adding a dependency is unwanted: re-read the file inside `persist()` before writing to merge changes:
```ts
private persist(): void {
  const dir = dirname(this.filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Merge in case another process wrote since we last loaded
  const disk = this.load();
  const merged: VaultStore = {
    secrets: { ...disk.secrets, ...this.store.secrets },
  };
  writeFileSync(this.filePath, JSON.stringify(merged, null, 2), { encoding: 'utf8', mode: 0o600 });
  this.store = merged;
}
```

---

### 5.6 Add IP bypass guard for IPv4-mapped IPv6 addresses
**File:** `src/runtime/egress.ts:72`

The current IP detection regex misses `::ffff:192.168.1.1`:

```ts
// Before:
const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || /^\[?[0-9a-fA-F:]+\]?$/.test(host);

// After:
const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const IPV6_RE = /^\[?[0-9a-fA-F:]+\]?$/;
const IPV4_MAPPED_RE = /^::ffff:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i;
const isIp = IPV4_RE.test(host) || IPV6_RE.test(host) || IPV4_MAPPED_RE.test(host);
```

Also update `isLoopback()` to recognize `::ffff:127.0.0.1`:
```ts
function isLoopback(host: string): boolean {
  const h = normalizeHost(host);
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]'
    || h === '::ffff:127.0.0.1';
}
```

Add tests in `src/__tests__/egress.test.ts` for IPv4-mapped addresses.

---

## Track 6 — Incomplete Implementations (P2)

### 6.1 Complete `doctor.ts` vault check abstraction
See 5.1 above.

### 6.2 Complete YouTube resumable upload or clearly mark TODO
**File:** `src/connector/youtube/tools.ts:77-100`

Either:
- Implement the resumable upload flow following Google's resumable upload API
- Or add a clear `throw new Error('YouTube video upload not yet implemented. Track: github issue #XX')` instead of the silent stub

Do not leave a stub that silently does nothing.

### 6.3 Log a warning (not silently skip) in `loadBlueprints`
See 3.4 above — handled by the Zod parse error logging.

### 6.4 Add egress policy enforcement to GitHub/YouTube auth flows
**Files:** `src/connector/github/auth.ts`, `src/connector/youtube/auth.ts`

Both currently use raw global `fetch`. The OAuth endpoints (`github.com`, `oauth2.googleapis.com`) need to be added to the policy pack allowlists, and these functions need to accept a `safeFetch` or at minimum check that the endpoints they call are in the allowlist.

Minimal fix: add the required OAuth domains to the default policy pack and document that these are required for connector auth:

```yaml
# policy/packs/personal.yaml — add to egress_by_connector
egress_by_connector:
  connector.github.app:
    - github.com
    - api.github.com
  connector.youtube.oauth:
    - oauth2.googleapis.com
    - www.googleapis.com
```

Longer-term: thread `safeFetch` into these auth functions.

---

## Track 7 — Test Coverage (P2)

Priority order: test the most critical paths first.

### 7.1 `src/__tests__/runner.test.ts` (new file)
Cover:
- Pipeline with all steps succeeding → `succeeded` status
- Pipeline where step fails → `failed` status, subsequent steps skipped
- Step blocked by approval policy → `blocked` outcome, approval record created
- Step blocked by budget → `blocked` outcome
- Step blocked by `allowed_tools` list
- `dryRun: true` → audit entry has `dry_run=true`, no real handler called
- Template resolution: `{{varName}}` and `{{step.id.output}}` substituted correctly
- Unknown tool in non-dry-run mode → `failure` outcome

Use `MemoryDatabase` from `src/__tests__/memory-db.ts` and mock tool handlers via `registerTool()`.

### 7.2 `src/__tests__/blueprint-engine.test.ts` (new file)
Cover:
- `loadBlueprints()` with a temp directory containing valid and malformed YAML
- `selectBlueprint()` — keyword match, no match (returns null), ties
- `generatePlanOfRecord()` — markdown contains expected sections
- `resolveCapabilities()` — transitive prerequisites, cycle detection throws

### 7.3 `src/__tests__/connector-signing.test.ts` (new file)
Cover:
- Valid manifest + correct signature → `valid: true`
- Missing `package.sig` → `valid: false`
- Tampered manifest → `valid: false`
- Publisher not in trust roots → `valid: false`
- `loadTrustRoots()` with missing file → empty array
- `loadTrustRoots()` with valid file → entries returned

Use `tmp` directory with real file writes; generate test keypair with `tweetnacl`.

### 7.4 `src/__tests__/vault-file-provider.test.ts` (new file)
Cover:
- `setSecret` / `getSecret` roundtrip
- `deleteSecret` removes key
- `listSecrets` returns metadata
- Persists to disk and survives re-instantiation
- Corrupted file returns empty store (no throw)
- `status()` returns healthy

### 7.5 `src/__tests__/workspace-init.test.ts` (new file)
Cover:
- `initWorkspace()` creates `.cloned/` directory structure
- Config file is written and parseable
- `initBudgets()` populates budget rows for each tier

### 7.6 `src/__tests__/pairing-middleware.test.ts` (new file)
Cover:
- Bootstrap mode (no approved pairings) → all requests pass
- Enforcement mode → missing header returns 401
- Enforcement mode → unknown device ID returns 401
- Enforcement mode → approved device ID passes
- Exempt routes (`POST /v1/pairings`, `GET /v1/doctor`) always pass

### 7.7 Fix test schema duplication
**Files:** `src/__tests__/governance.test.ts`, `src/__tests__/audit.test.ts`

Both define the full SQL schema inline. Extract to a shared helper:
```ts
// src/__tests__/test-helpers.ts — add:
export function createTestDb(): Database.Database {
  const db = openDb(':memory:'); // uses the real applyInlineSchema
  return db;
}
```

Replace the inline `db.exec(...)` schema blocks in both test files with `createTestDb()`.

---

## Track 8 — TypeScript Strictness (P3)

### 8.1 Enable additional strict checks in `tsconfig.json`

```json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
  }
}
```

Run `npm run typecheck` and fix all resulting errors before merging. Common fixes:
- Prefix unused parameters with `_` (already the convention per AGENTS.md)
- Remove dead local variables

---

## Execution Order & Dependencies

```
Track 1 (Bugs) → must be first; no dependencies
  1.1 jsonHash         — standalone
  1.2 openDb           — prerequisite for 5.4 test isolation
  1.3 budget race      — depends on nothing
  1.4 selectBlueprint  — standalone
  1.5 cycle detection  — standalone
  1.6 POST /v1/runs    — depends on Track 2 (Zod) being done first

Track 2 (Types) → start after Track 1.1-1.5
  2.1 Zod schemas      — prerequisite for Track 3.1, 3.4
  2.2 Azure interface  — standalone
  2.3 Route types      — depends on 2.1 and Track 3.1 (shared RouteOpts)

Track 3 (Duplication) → start after Track 2.1
  3.1 RouteOpts        — depends on 2.1 for WorkspaceConfig type
  3.2 Chain hash       — standalone
  3.3 CLI shared init  — standalone
  3.4 Blueprint scan   — depends on 2.1 (BlueprintSchema)
  3.5 selectConnectors — standalone

Track 4 (Performance) → start after Track 3
  4.1 Pairing cache    — depends on Track 5.1 (return value)
  4.2 Policy cache     — depends on Track 3 (import path changes)
  4.3 initBudgets sync — standalone
  4.4 Vault batch      — standalone

Track 5 (Architecture) → can run parallel with Track 4
  5.1 Doctor vault fix — depends on Track 4.3 (doctor async)
  5.2 require() fix    — depends on 5.1 (same file)
  5.3 TOOL_COSTS warn  — standalone
  5.4 Singleton reset  — depends on 1.2
  5.5 FileVault lock   — standalone
  5.6 IPv6 egress      — standalone

Track 6 (Incomplete) → can run parallel
  6.1 handled in 5.1
  6.2 YouTube upload   — standalone
  6.3 handled in 3.4
  6.4 OAuth egress     — depends on policy YAML changes

Track 7 (Tests) → best started after Track 1 complete; some after Track 3
  7.1 runner tests     — depends on 1.3 (budget fix) and 1.2
  7.2 blueprint tests  — depends on 1.4, 1.5, 3.4
  7.3 signing tests    — standalone
  7.4 vault tests      — depends on 5.5
  7.5 workspace tests  — standalone
  7.6 pairing tests    — depends on 4.1
  7.7 schema dedup     — depends on 1.2

Track 8 (TypeScript) → last; requires all other tracks complete
```

---

## Completion Checklist

| # | Item | Track | File(s) | Done |
|---|------|-------|---------|------|
| 1.1 | `jsonHash` null guard | Bug | `shared/redact.ts` | [ ] |
| 1.2 | `openDb` remove singleton | Bug | `workspace/db.ts` | [ ] |
| 1.3 | Budget TOCTOU transaction | Bug | `governance/budgets.ts`, `runtime/runner.ts` | [ ] |
| 1.4 | `selectBlueprint` zero-score null | Bug | `blueprint/engine.ts` | [ ] |
| 1.5 | Cycle detection in capabilities | Bug | `capability/graph.ts` | [ ] |
| 1.6 | Implement `POST /v1/runs` | Bug | `api/routes/runs.ts` | [ ] |
| 2.1 | Zod schemas for all YAML loads | Type | `shared/schemas.ts` + 3 loaders | [ ] |
| 2.2 | Azure provider interface | Type | `vault/azure-provider.ts` | [ ] |
| 2.3 | Typed Fastify route params | Type | `api/routes/*.ts` | [ ] |
| 3.1 | Shared `RouteOpts` + `getWorkspaceId` | DRY | `api/types.ts` + 8 route files | [ ] |
| 3.2 | Shared `computeChainHash` | DRY | `shared/chain-hash.ts` + 2 callers | [ ] |
| 3.3 | CLI `requireWorkspace()` helper | DRY | `cli/cli-shared.ts` + 7 commands | [ ] |
| 3.4 | Auto-discover blueprints | DRY | `blueprint/engine.ts` | [ ] |
| 3.5 | `selectConnectors` use graph | DRY | `capability/graph.ts` | [ ] |
| 4.1 | Cache pairing bootstrap flag | Perf | `api/pairing-middleware.ts` | [ ] |
| 4.2 | Cache policy packs | Perf | `governance/policy-cache.ts` | [ ] |
| 4.3 | `initBudgets` → sync | Perf | `governance/budgets.ts` | [ ] |
| 4.4 | Batch vault `getSecrets()` | Perf | `vault/types.ts` + providers | [ ] |
| 5.1 | Doctor uses VaultProvider | Arch | `runtime/doctor.ts` | [ ] |
| 5.2 | `createRequire` for SQLite check | Arch | `runtime/doctor.ts` | [ ] |
| 5.3 | TOOL_COSTS warning + manifest path | Arch | `runtime/runner.ts` | [ ] |
| 5.4 | Vault/DB singleton reset for tests | Arch | `vault/index.ts`, `vault/dev-provider.ts` | [ ] |
| 5.5 | `FileVaultProvider` concurrency | Arch | `vault/file-provider.ts` | [ ] |
| 5.6 | IPv4-mapped IPv6 egress guard | Arch | `runtime/egress.ts` | [ ] |
| 6.2 | YouTube upload: implement or throw | Incomplete | `connector/youtube/tools.ts` | [ ] |
| 6.4 | OAuth egress domains in policy | Incomplete | `policy/packs/*.yaml` | [ ] |
| 7.1 | `runner.test.ts` | Test | `__tests__/runner.test.ts` | [ ] |
| 7.2 | `blueprint-engine.test.ts` | Test | `__tests__/blueprint-engine.test.ts` | [ ] |
| 7.3 | `connector-signing.test.ts` | Test | `__tests__/connector-signing.test.ts` | [ ] |
| 7.4 | `vault-file-provider.test.ts` | Test | `__tests__/vault-file-provider.test.ts` | [ ] |
| 7.5 | `workspace-init.test.ts` | Test | `__tests__/workspace-init.test.ts` | [ ] |
| 7.6 | `pairing-middleware.test.ts` | Test | `__tests__/pairing-middleware.test.ts` | [ ] |
| 7.7 | Deduplicate test DB schema | Test | `__tests__/test-helpers.ts` | [ ] |
| 8.1 | Enable strict TS checks | TypeScript | `tsconfig.json` | [ ] |

**Total: 33 items across 8 tracks.**

---

## What Is Explicitly Out of Scope

The following were noted but are architectural decisions beyond refactoring:

- **Full async job queue for runs** — `POST /v1/runs` stub fix (1.6) is synchronous. A proper background worker with status polling is a new feature, not a refactor.
- **Content guard readability pipeline** — replacing `stripHtml` with a production parser (e.g., `@mozilla/readability`) is a feature addition.
- **YouTube resumable upload** — completing the upload implementation is new feature work.
- **ADR documents** — useful but editorial, not code changes.
- **JSDoc comments** — valuable but low risk; do after all correctness work is done.
