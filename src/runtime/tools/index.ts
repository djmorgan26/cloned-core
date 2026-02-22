/**
 * Built-in tool handler registration.
 *
 * Import and call registerBuiltinTools() once at startup (in the CLI run command).
 * Each handler enforces egress via safeFetch and retrieves secrets via vault.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dump } from 'js-yaml';
import { registerTool } from '../runner.js';
import { makeSafeFetch } from '../safe-fetch.js';
import { webSearch } from './web-search.js';
import { synthesize } from './synthesis.js';
import { saveArtifact } from './artifact-save.js';
import { createIssue, createPullRequest } from '../../connector/github/tools.js';
import { packageVideo } from '../../connector/youtube/tools.js';
import { getVaultProvider } from '../../vault/index.js';
import { loadPolicyPack } from '../../governance/policy.js';
import { getClonedPaths } from '../../workspace/paths.js';
import type { ClonedPaths } from '../../workspace/types.js';

export interface EgressUpdateOptions {
  policyPackId: string;
  paths: ClonedPaths;
  scope: 'global' | 'tool';
  toolId?: string;
  domains: string[];
}

export function applyEgressUpdate({
  policyPackId,
  paths,
  scope,
  toolId,
  domains,
}: EgressUpdateOptions): { status: string; scope: string; tool_id?: string; domains: string[] } {
  if (scope === 'tool' && !toolId) {
    throw new Error('tool scope requires tool_id');
  }

  const pack = loadPolicyPack(policyPackId, paths.policyDir);
  const uniqueDomains = Array.from(new Set(domains));

  if (scope === 'global') {
    pack.allowlists.egress_domains = Array.from(new Set([
      ...pack.allowlists.egress_domains,
      ...uniqueDomains,
    ]));
  } else {
    const cur = pack.allowlists.egress_by_tool[toolId!] ?? [];
    pack.allowlists.egress_by_tool[toolId!] = Array.from(new Set([
      ...cur,
      ...uniqueDomains,
    ]));
  }

  if (!existsSync(paths.policyDir)) {
    mkdirSync(paths.policyDir, { recursive: true });
  }
  const path = `${paths.policyDir}/${policyPackId}.yaml`;
  writeFileSync(path, dump(pack), 'utf8');

  return { status: 'updated', scope, tool_id: toolId, domains: uniqueDomains };
}

export function registerBuiltinTools(policyPackId: string, cwd?: string): void {
  const paths = getClonedPaths(cwd);
  // Load policy with workspace overrides (allows firewall edits via CLI/tool)
  const policy = loadPolicyPack(policyPackId, paths.policyDir);
  const vaultPath = `${paths.root}/vault.dev.json`;
  const vault = getVaultProvider(vaultPath);

  // ── Web Search ────────────────────────────────────────────────────────────
  registerTool('cloned.mcp.web.search@v1', async (input) => {
    const sf = makeSafeFetch(policy, { toolId: 'cloned.mcp.web.search@v1' });
    // Brave key: vault takes precedence over env, enabling seamless key rotation
    const braveApiKey =
      (await vault.getSecret('brave.search.api_key')) ??
      process.env['BRAVE_API_KEY'];
    return webSearch(
      {
        query: String(input['query'] ?? ''),
        max_results: typeof input['max_results'] === 'number' ? input['max_results'] : 10,
        provider: (input['provider'] as 'auto' | 'duckduckgo' | 'brave') ?? 'auto',
      },
      sf,
      braveApiKey ? { braveApiKey } : undefined,
    );
  });

  // ── Synthesis ─────────────────────────────────────────────────────────────
  registerTool('cloned.internal.synthesis@v1', async (input) => {
    const sf = makeSafeFetch(policy, { toolId: 'cloned.internal.synthesis@v1' });
    return synthesize(
      {
        topic: String(input['topic'] ?? ''),
        sources: (input['sources'] as Parameters<typeof synthesize>[0]['sources']) ?? '',
        format: (input['format'] as 'markdown' | 'text') ?? 'markdown',
        include_citations: input['include_citations'] !== false,
      },
      sf,
      vault,
    );
  });

  // ── Artifact Save ─────────────────────────────────────────────────────────
  registerTool('cloned.internal.artifact.save@v1', async (input) => {
    return saveArtifact(
      {
        content: (input['content'] as string | Record<string, unknown>) ?? '',
        filename: String(input['filename'] ?? 'artifact.txt'),
        schema: input['schema'] as string | undefined,
        metadata: input['metadata'] as Record<string, unknown> | undefined,
      },
      paths.artifactsDir,
    );
  });

  // ── Approval Check ────────────────────────────────────────────────────────
  // Returns approval status; the runner's policy layer is the real gate.
  // This tool is informational – it surfaces the approval ID so the user knows
  // what to approve via `cloned approvals approve <id>`.
  registerTool('cloned.internal.approval.check@v1', async (input) => {
    return {
      scope: String(input['scope'] ?? ''),
      risk_level: String(input['risk_level'] ?? 'low'),
      message:
        'Approval gate reached. Use `cloned approvals list` to see pending approvals ' +
        'and `cloned approvals approve <id>` to unblock.',
      status: 'approval_required',
    };
  });

  // ── GitHub: Issue Create ──────────────────────────────────────────────────
  registerTool('cloned.mcp.github.issue.create@v1', async (input) => {
    const token = await vault.getSecret('github.oauth.access_token');
    if (!token) throw new Error('GitHub not connected. Run: cloned connect github');
    const sf = makeSafeFetch(policy, { toolId: 'cloned.mcp.github.issue.create@v1', connectorId: 'connector.github.app' });
    return createIssue(
      { token, fetch: sf },
      {
        owner: String(input['owner'] ?? ''),
        repo: String(input['repo'] ?? ''),
        title: String(input['title'] ?? ''),
        body: input['body'] as string | undefined,
        labels: input['labels'] as string[] | undefined,
      },
    );
  });

  // ── GitHub: PR Create ─────────────────────────────────────────────────────
  registerTool('cloned.mcp.github.pr.create@v1', async (input) => {
    const token = await vault.getSecret('github.oauth.access_token');
    if (!token) throw new Error('GitHub not connected. Run: cloned connect github');
    const sf = makeSafeFetch(policy, { toolId: 'cloned.mcp.github.pr.create@v1', connectorId: 'connector.github.app' });
    return createPullRequest(
      { token, fetch: sf },
      {
        owner: String(input['owner'] ?? ''),
        repo: String(input['repo'] ?? ''),
        title: String(input['title'] ?? ''),
        body: input['body'] as string | undefined,
        head: String(input['head'] ?? ''),
        base: String(input['base'] ?? 'main'),
        draft: Boolean(input['draft'] ?? false),
      },
    );
  });

  // ── YouTube: Package Video ────────────────────────────────────────────────
  registerTool('cloned.mcp.youtube.video.package@v1', async (input) => {
    const token = await vault.getSecret('youtube.oauth.access_token');
    return packageVideo(
      { access_token: token ?? '', assist_mode: true },
      {
        title: String(input['title'] ?? 'Untitled Video'),
        description: String(input['description'] ?? ''),
        tags: input['tags'] as string[] | undefined,
        category_id: input['category_id'] as string | undefined,
        privacy: (input['privacy'] as 'public' | 'private' | 'unlisted') ?? 'private',
      },
    );
  });

  // ── Security: Egress Firewall Update (approval-gated) ─────────────────────
  registerTool('cloned.internal.security.egress.update@v1', async (input) => {
    const scope = String(input['scope'] ?? 'global'); // 'global' | 'tool'
    const toolId = input['tool_id'] as string | undefined;
    const domains = Array.isArray(input['domains'])
      ? (input['domains'] as unknown[]).map(String)
      : [String(input['domain'] ?? '')].filter(Boolean);
    return applyEgressUpdate({
      policyPackId,
      paths,
      scope: scope as 'global' | 'tool',
      toolId,
      domains,
    });
  });

  // cloned.mcp.youtube.video.upload@v1 is intentionally NOT registered here.
  // Uploads require an explicit approval in the queue. The policy layer blocks
  // them as high-risk actions; they must be manually approved first.
}
