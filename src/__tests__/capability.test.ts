import { describe, it, expect } from '@jest/globals';
import {
  buildCapabilityGraph,
  resolveCapabilities,
  selectConnectors,
  getMissingCapabilities,
} from '../capability/graph.js';

describe('Capability Graph', () => {
  it('builds graph with built-in capabilities', () => {
    const graph = buildCapabilityGraph();
    expect(graph.capabilities.size).toBeGreaterThan(0);
    expect(graph.capabilities.has('cap.research.web_search')).toBe(true);
    expect(graph.capabilities.has('cap.dev.repo_management')).toBe(true);
    expect(graph.capabilities.has('cap.content.video_publish')).toBe(true);
  });

  it('resolves prerequisites transitively', () => {
    const graph = buildCapabilityGraph();
    // deep_research requires web_search
    const resolved = resolveCapabilities(graph, ['cap.research.deep_research']);
    expect(resolved).toContain('cap.research.deep_research');
    expect(resolved).toContain('cap.research.web_search');
  });

  it('resolves video_publish prerequisites', () => {
    const graph = buildCapabilityGraph();
    const resolved = resolveCapabilities(graph, ['cap.content.video_publish']);
    expect(resolved).toContain('cap.content.video_publish');
    expect(resolved).toContain('cap.content.video_packaging');
    expect(resolved).toContain('cap.identity.vault_secrets');
  });

  it('selects connectors to cover capabilities', () => {
    const graph = buildCapabilityGraph();
    const connectors = selectConnectors(graph, [
      'cap.dev.repo_management',
      'cap.dev.issue_tracking',
    ]);
    expect(connectors.length).toBeGreaterThan(0);
    const githubConnector = connectors.find((c) => c.connector === 'connector.github.app');
    expect(githubConnector).toBeDefined();
  });

  it('detects missing capabilities', () => {
    const graph = buildCapabilityGraph();
    const missing = getMissingCapabilities(graph, ['cap.does.not.exist', 'cap.research.web_search']);
    expect(missing).toContain('cap.does.not.exist');
    expect(missing).not.toContain('cap.research.web_search');
  });

  it('returns no missing for known capabilities', () => {
    const graph = buildCapabilityGraph();
    const missing = getMissingCapabilities(graph, ['cap.research.web_search']);
    expect(missing).toHaveLength(0);
  });
});
