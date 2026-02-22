import type { PolicyPack } from '../../governance/policy.js';
import { makeSafeFetch } from '../safe-fetch.js';
import {
  createIssue,
  createPullRequest,
  type GitHubToolContext,
  type IssueCreateInput,
  type PullRequestCreateInput,
} from '../../connector/github/tools.js';
import {
  packageVideo,
  type YouTubeToolContext,
  type VideoPackageInput,
} from '../../connector/youtube/tools.js';

interface WorkerRequest {
  tool_id: string;
  ctx?: Record<string, unknown>;
  input: unknown;
  policy: PolicyPack;
  connector_id?: string;
}

interface WorkerResponse {
  status: 'ok' | 'error';
  output?: unknown;
  error?: string;
}

function readInput(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('error', (err) => reject(err));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function main() {
  try {
    const raw = await readInput();
    if (!raw.trim()) throw new Error('Empty payload');
    const payload = JSON.parse(raw) as WorkerRequest;

    const safeFetch = makeSafeFetch(payload.policy, {
      toolId: payload.tool_id,
      connectorId: payload.connector_id,
    });

    const result = await dispatchTool(payload, safeFetch);
    writeResponse({ status: 'ok', output: result });
  } catch (err) {
    writeResponse({ status: 'error', error: (err as Error).message });
    process.exitCode = 1;
  }
}

function writeResponse(res: WorkerResponse): void {
  process.stdout.write(`${JSON.stringify(res)}\n`);
}

async function dispatchTool(payload: WorkerRequest, safeFetch: GitHubToolContext['fetch']) {
  switch (payload.tool_id) {
    case 'cloned.mcp.github.issue.create@v1': {
      const ctx = buildGitHubContext(payload.ctx, safeFetch);
      return createIssue(ctx, payload.input as IssueCreateInput);
    }
    case 'cloned.mcp.github.pr.create@v1': {
      const ctx = buildGitHubContext(payload.ctx, safeFetch);
      return createPullRequest(ctx, payload.input as PullRequestCreateInput);
    }
    case 'cloned.mcp.youtube.video.package@v1': {
      const ctx = buildYoutubeContext(payload.ctx);
      return packageVideo(ctx, payload.input as VideoPackageInput);
    }
    default:
      throw new Error(`Unhandled tool in sandbox: ${payload.tool_id}`);
  }
}

function buildGitHubContext(ctx: WorkerRequest['ctx'], safeFetch: GitHubToolContext['fetch']): GitHubToolContext {
  const token = ctx?.['token'];
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('GitHub token missing for sandboxed tool');
  }
  return { token, fetch: safeFetch };
}

function buildYoutubeContext(ctx: WorkerRequest['ctx']): YouTubeToolContext {
  const accessToken = ctx?.['access_token'];
  if (typeof accessToken !== 'string') {
    throw new Error('YouTube access_token missing for sandboxed tool');
  }
  return {
    access_token: accessToken,
    assist_mode: ctx?.['assist_mode'] !== false,
    // ctx may include other flags (ignored here)
  };
}

await main();
