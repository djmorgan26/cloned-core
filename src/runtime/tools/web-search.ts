/**
 * Web search tool – cloned.mcp.web.search@v1
 *
 * Uses DuckDuckGo Instant Answer API (no API key required).
 * Falls back to DuckDuckGo HTML scraping for broader results.
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
}

export interface WebSearchOutput {
  query: string;
  results: SearchResult[];
  result_count: number;
}

/**
 * Search DuckDuckGo and return structured results.
 * The safeFetch parameter enforces egress policy automatically.
 */
export async function webSearch(
  input: WebSearchInput,
  safeFetch: SafeFetch,
): Promise<WebSearchOutput> {
  const { query, max_results = 10 } = input;

  // DuckDuckGo Instant Answer API – returns RelatedTopics for broader queries
  const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;

  const resp = await safeFetch(apiUrl, {
    headers: { 'User-Agent': 'cloned-agent/0.1 (research tool)' },
  });

  if (!resp.ok) {
    throw new Error(`DuckDuckGo API returned ${resp.status}`);
  }

  const data = await resp.json() as DdgApiResponse;
  const results: SearchResult[] = [];

  // Abstract (top result)
  if (data.Abstract && data.AbstractURL) {
    results.push({
      title: data.Heading ?? query,
      url: data.AbstractURL,
      snippet: data.Abstract,
    });
  }

  // Related topics
  for (const topic of data.RelatedTopics ?? []) {
    if (results.length >= max_results) break;
    if ('Text' in topic && topic.FirstURL) {
      results.push({
        title: topic.Text.split(' - ')[0] ?? topic.Text,
        url: topic.FirstURL,
        snippet: topic.Text,
      });
    }
    // Nested topics inside a "Topics" group
    if ('Topics' in topic) {
      for (const sub of topic.Topics ?? []) {
        if (results.length >= max_results) break;
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

  return { query, results, result_count: results.length };
}

// DuckDuckGo API response shape (partial)
interface DdgApiResponse {
  Heading?: string;
  Abstract?: string;
  AbstractURL?: string;
  RelatedTopics?: Array<
    | { Text: string; FirstURL: string }
    | { Name: string; Topics: Array<{ Text: string; FirstURL: string }> }
  >;
}
