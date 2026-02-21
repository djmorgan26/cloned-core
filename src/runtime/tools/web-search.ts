/**
 * Web search tool – cloned.mcp.web.search@v1
 *
 * Supports two providers:
 *   - Brave Search API (preferred, requires BRAVE_API_KEY or vault key)
 *   - DuckDuckGo Instant Answer API (fallback, no key required)
 *
 * Provider selection: 'auto' picks Brave if a key is available, else DuckDuckGo.
 */
import type { SafeFetch } from '../safe-fetch.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchInput {
  query: string;
  max_results?: number;
  /** 'auto' = use Brave if key available, else DuckDuckGo. Default: 'auto'. */
  provider?: 'auto' | 'duckduckgo' | 'brave';
}

export interface WebSearchOutput {
  query: string;
  results: SearchResult[];
  result_count: number;
  provider: 'brave' | 'duckduckgo';
}

export interface WebSearchOptions {
  braveApiKey?: string;
}

/**
 * Search the web and return structured results.
 * The safeFetch parameter enforces egress policy automatically.
 */
export async function webSearch(
  input: WebSearchInput,
  safeFetch: SafeFetch,
  opts?: WebSearchOptions,
): Promise<WebSearchOutput> {
  const { query, max_results = 10, provider = 'auto' } = input;

  const useBrave =
    provider === 'brave' ||
    (provider === 'auto' && Boolean(opts?.braveApiKey));

  if (useBrave) {
    if (!opts?.braveApiKey) {
      throw new Error('Brave Search API key required but not provided');
    }
    return braveSearch(query, max_results, safeFetch, opts.braveApiKey);
  }

  return duckduckgoSearch(query, max_results, safeFetch);
}

// ---------------------------------------------------------------------------
// Brave Search
// ---------------------------------------------------------------------------

async function braveSearch(
  query: string,
  maxResults: number,
  safeFetch: SafeFetch,
  apiKey: string,
): Promise<WebSearchOutput> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;

  const resp = await safeFetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!resp.ok) {
    throw new Error(`Brave Search API returned ${resp.status}`);
  }

  const data = await resp.json() as BraveApiResponse;
  const results: SearchResult[] = (data.web?.results ?? [])
    .slice(0, maxResults)
    .map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description ?? '',
    }));

  return { query, results, result_count: results.length, provider: 'brave' };
}

// ---------------------------------------------------------------------------
// DuckDuckGo
// ---------------------------------------------------------------------------

async function duckduckgoSearch(
  query: string,
  maxResults: number,
  safeFetch: SafeFetch,
): Promise<WebSearchOutput> {
  const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;

  const resp = await safeFetch(apiUrl, {
    headers: { 'User-Agent': 'cloned-agent/0.1 (research tool)' },
  });

  if (!resp.ok) {
    throw new Error(`DuckDuckGo API returned ${resp.status}`);
  }

  const data = await resp.json() as DdgApiResponse;
  const results: SearchResult[] = [];

  if (data.Abstract && data.AbstractURL) {
    results.push({
      title: data.Heading ?? query,
      url: data.AbstractURL,
      snippet: data.Abstract,
    });
  }

  for (const topic of data.RelatedTopics ?? []) {
    if (results.length >= maxResults) break;
    if ('Text' in topic && topic.FirstURL) {
      results.push({
        title: topic.Text.split(' - ')[0] ?? topic.Text,
        url: topic.FirstURL,
        snippet: topic.Text,
      });
    }
    if ('Topics' in topic) {
      for (const sub of topic.Topics ?? []) {
        if (results.length >= maxResults) break;
        if (sub.FirstURL && sub.Text) {
          results.push({
            title: sub.Text.split(' - ')[0] ?? sub.Text,
            url: sub.FirstURL,
            snippet: sub.Text,
          });
        }
      }
    }
  }

  return { query, results, result_count: results.length, provider: 'duckduckgo' };
}

// ---------------------------------------------------------------------------
// API response shapes (partial)
// ---------------------------------------------------------------------------

interface BraveApiResponse {
  web?: {
    results: Array<{
      title: string;
      url: string;
      description?: string;
    }>;
  };
}

interface DdgApiResponse {
  Heading?: string;
  Abstract?: string;
  AbstractURL?: string;
  RelatedTopics?: Array<
    | { Text: string; FirstURL: string }
    | { Name: string; Topics: Array<{ Text: string; FirstURL: string }> }
  >;
}
