/**
 * GitHub connector tool implementations (MCP-style).
 * Each tool is a function that takes validated input and returns a result.
 *
 * All outbound HTTP requests must use the provided SafeFetch (ctx.fetch)
 * to ensure egress policy enforcement and auditability.
 */

const GITHUB_API = 'https://api.github.com';

export interface GitHubToolContext {
  token: string;
  fetch: (url: string | URL, init?: RequestInit) => Promise<Response>;
}

export interface IssueCreateInput {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
}

export interface IssueCreateOutput {
  number: number;
  html_url: string;
  title: string;
}

export async function createIssue(
  ctx: GitHubToolContext,
  input: IssueCreateInput,
): Promise<IssueCreateOutput> {
  const resp = await ctx.fetch(`${GITHUB_API}/repos/${input.owner}/${input.repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      labels: input.labels,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GitHub issue create failed ${resp.status}: ${err}`);
  }

  const data = await resp.json() as { number: number; html_url: string; title: string };
  return { number: data.number, html_url: data.html_url, title: data.title };
}

export interface PullRequestCreateInput {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  head: string;
  base: string;
  draft?: boolean;
}

export interface PullRequestCreateOutput {
  number: number;
  html_url: string;
  title: string;
  draft: boolean;
}

export async function createPullRequest(
  ctx: GitHubToolContext,
  input: PullRequestCreateInput,
): Promise<PullRequestCreateOutput> {
  const resp = await ctx.fetch(`${GITHUB_API}/repos/${input.owner}/${input.repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
      draft: input.draft ?? false,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GitHub PR create failed ${resp.status}: ${err}`);
  }

  const data = await resp.json() as {
    number: number;
    html_url: string;
    title: string;
    draft: boolean;
  };
  return {
    number: data.number,
    html_url: data.html_url,
    title: data.title,
    draft: data.draft,
  };
}

export interface RepoListInput {
  owner: string;
  type?: 'all' | 'public' | 'private' | 'forks' | 'sources';
  per_page?: number;
}

export interface RepoInfo {
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
}

export async function listRepos(
  ctx: GitHubToolContext,
  input: RepoListInput,
): Promise<RepoInfo[]> {
  const params = new URLSearchParams({
    type: input.type ?? 'all',
    per_page: String(input.per_page ?? 30),
  });

  const resp = await ctx.fetch(
    `${GITHUB_API}/orgs/${input.owner}/repos?${params}`,
    {
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GitHub list repos failed ${resp.status}: ${err}`);
  }

  const data = await resp.json() as RepoInfo[];
  return data;
}
