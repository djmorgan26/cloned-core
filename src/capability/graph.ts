export type RiskLevel = 'low' | 'med' | 'high';
export type CostModel = 'none' | 'variable' | 'fixed';

export interface Capability {
  id: string;           // e.g. "cap.research.web_search"
  description: string;
  risk_level: RiskLevel;
  cost_model: CostModel;
  cost_notes?: string;
  required_approvals: string[];
  prerequisites: string[];  // capability ids
}

export interface CapabilityNode {
  capability: Capability;
  provided_by: string[];  // connector ids
}

export interface CapabilityGraph {
  capabilities: Map<string, CapabilityNode>;
}

// Built-in capability registry
const BUILT_IN_CAPABILITIES: Capability[] = [
  {
    id: 'cap.research.web_search',
    description: 'Search the web for information',
    risk_level: 'low',
    cost_model: 'variable',
    cost_notes: 'Varies by search provider',
    required_approvals: [],
    prerequisites: [],
  },
  {
    id: 'cap.research.deep_research',
    description: 'Multi-step deep research with citations',
    risk_level: 'low',
    cost_model: 'variable',
    required_approvals: [],
    prerequisites: ['cap.research.web_search'],
  },
  {
    id: 'cap.dev.repo_management',
    description: 'Read and write to code repositories',
    risk_level: 'med',
    cost_model: 'none',
    required_approvals: [],
    prerequisites: ['cap.identity.vault_secrets'],
  },
  {
    id: 'cap.dev.issue_tracking',
    description: 'Create and manage issues and pull requests',
    risk_level: 'low',
    cost_model: 'none',
    required_approvals: [],
    prerequisites: ['cap.identity.vault_secrets'],
  },
  {
    id: 'cap.content.video_packaging',
    description: 'Package video content for publishing',
    risk_level: 'med',
    cost_model: 'variable',
    required_approvals: [],
    prerequisites: [],
  },
  {
    id: 'cap.content.video_publish',
    description: 'Publish video content to a platform',
    risk_level: 'high',
    cost_model: 'fixed',
    required_approvals: ['content_publish'],
    prerequisites: ['cap.content.video_packaging', 'cap.identity.vault_secrets'],
  },
  {
    id: 'cap.identity.vault_secrets',
    description: 'Store and retrieve secrets from vault',
    risk_level: 'med',
    cost_model: 'none',
    required_approvals: [],
    prerequisites: [],
  },
  {
    id: 'cap.comm.slack_posting',
    description: 'Post messages to Slack',
    risk_level: 'med',
    cost_model: 'none',
    required_approvals: [],
    prerequisites: ['cap.identity.vault_secrets'],
  },
];

// Connector -> capabilities mapping
const CONNECTOR_CAPABILITIES: Record<string, string[]> = {
  'connector.github.app': ['cap.dev.repo_management', 'cap.dev.issue_tracking'],
  'connector.youtube.oauth': ['cap.content.video_packaging', 'cap.content.video_publish'],
  'connector.web.search': ['cap.research.web_search', 'cap.research.deep_research'],
  'connector.slack.bot': ['cap.comm.slack_posting'],
};

export function buildCapabilityGraph(): CapabilityGraph {
  const graph: CapabilityGraph = { capabilities: new Map() };

  for (const cap of BUILT_IN_CAPABILITIES) {
    const providers: string[] = [];
    for (const [connId, caps] of Object.entries(CONNECTOR_CAPABILITIES)) {
      if (caps.includes(cap.id)) providers.push(connId);
    }
    graph.capabilities.set(cap.id, { capability: cap, provided_by: providers });
  }

  return graph;
}

/**
 * Compute the full set of required capabilities (including prerequisites transitively).
 */
export function resolveCapabilities(
  graph: CapabilityGraph,
  required: string[],
): string[] {
  const resolved = new Set<string>();

  function resolve(id: string) {
    if (resolved.has(id)) return;
    resolved.add(id);
    const node = graph.capabilities.get(id);
    if (node) {
      for (const prereq of node.capability.prerequisites) {
        resolve(prereq);
      }
    }
  }

  for (const id of required) {
    resolve(id);
  }

  return Array.from(resolved);
}

/**
 * Find the minimal set of connectors that cover a set of capabilities.
 */
export function selectConnectors(
  graph: CapabilityGraph,
  capabilities: string[],
): { connector: string; covers: string[] }[] {
  const uncovered = new Set(capabilities);
  const selected: { connector: string; covers: string[] }[] = [];

  // Greedy: pick the connector that covers the most uncovered capabilities
  while (uncovered.size > 0) {
    let bestConnector = '';
    let bestCoverage: string[] = [];

    for (const [connId, caps] of Object.entries(CONNECTOR_CAPABILITIES)) {
      const covers = caps.filter((c) => uncovered.has(c));
      if (covers.length > bestCoverage.length) {
        bestConnector = connId;
        bestCoverage = covers;
      }
    }

    if (!bestConnector || bestCoverage.length === 0) break; // Can't cover remaining

    selected.push({ connector: bestConnector, covers: bestCoverage });
    for (const c of bestCoverage) uncovered.delete(c);
  }

  return selected;
}

export function getMissingCapabilities(
  graph: CapabilityGraph,
  required: string[],
): string[] {
  return required.filter((id) => !graph.capabilities.has(id));
}
