/**
 * Built-in tool handler registration.
 *
 * Import and call registerBuiltinTools() once at startup (in the CLI run command).
 * Each handler enforces egress via safeFetch and retrieves secrets via vault.
 */
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

export function registerBuiltinTools(policyPackId: string, cwd?: string): void {
  const policy = loadPolicyPack(policyPackId);
  const paths = getClonedPaths(cwd);
  const vaultPath = `${paths.root}/vault.dev.json`;
  const vault = getVaultProvider(vaultPath);

  // ── Web Search ────────────────────────────────────────────────────────────
  registerTool('cloned.mcp.web.search@v1', async (input) => {
    const sf = makeSafeFetch(policy, { toolId: 'cloned.mcp.web.search@v1' });
    return webSearch(
      {
        query: String(input['query'] ?? ''),
        max_results: typeof input['max_results'] === 'number' ? input['max_results'] : 10,
      },
      sf,
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
    return createIssue(
      { token },
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
    return createPullRequest(
      { token },
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

  // cloned.mcp.youtube.video.upload@v1 is intentionally NOT registered here.
  // Uploads require an explicit approval in the queue. The policy layer blocks
  // them as high-risk actions; they must be manually approved first.
}
