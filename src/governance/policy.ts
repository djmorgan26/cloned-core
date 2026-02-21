import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ApprovalRule {
  match: {
    risk_level?: string;
    cost_category?: string;
    tool_id?: string;
  };
  requires_approval: boolean;
}

export interface PolicyPack {
  pack_id: string;
  tier: string;
  version: string;
  budgets: Record<string, { period: string; cap: number }>;
  approvals: {
    rules: ApprovalRule[];
  };
  allowlists: {
    publishers: string[];
    tools: string[];
    capabilities: string[];
    egress_domains: string[];
    egress_by_connector: Record<string, string[]>;
    egress_by_tool: Record<string, string[]>;
  };
  ui: {
    allowed_origins: string[];
  };
}

// Load a built-in policy pack from the POLICY/packs directory
function loadBuiltinPack(packName: string): PolicyPack | null {
  const packPath = join(__dirname, '../../POLICY/packs', `${packName}.yaml`);
  if (!existsSync(packPath)) return null;
  return load(readFileSync(packPath, 'utf8')) as PolicyPack;
}

export function loadPolicyPack(packId: string, customPackDir?: string): PolicyPack {
  // Try custom dir first
  if (customPackDir) {
    const customPath = join(customPackDir, `${packId}.yaml`);
    if (existsSync(customPath)) {
      return load(readFileSync(customPath, 'utf8')) as PolicyPack;
    }
  }

  // Parse pack_id like "policy.personal.default" -> "personal"
  const parts = packId.split('.');
  const tier = parts[1] ?? parts[0] ?? 'personal';

  const pack = loadBuiltinPack(tier);
  if (!pack) {
    return defaultPersonalPack();
  }
  return pack;
}

export function requiresApproval(pack: PolicyPack, context: {
  risk_level?: string;
  cost_category?: string;
  tool_id?: string;
}): boolean {
  for (const rule of pack.approvals.rules) {
    const matchRisk = !rule.match.risk_level || rule.match.risk_level === context.risk_level;
    const matchCat = !rule.match.cost_category || rule.match.cost_category === context.cost_category;
    const matchTool = !rule.match.tool_id || rule.match.tool_id === context.tool_id;
    if (matchRisk && matchCat && matchTool) {
      return rule.requires_approval;
    }
  }
  return false;
}

export function isEgressAllowed(
  pack: PolicyPack,
  domain: string,
  connectorId?: string,
  toolId?: string,
): boolean {
  // Check connector-specific allowlist
  if (connectorId && pack.allowlists.egress_by_connector[connectorId]) {
    return pack.allowlists.egress_by_connector[connectorId].includes(domain);
  }
  // Check tool-specific allowlist
  if (toolId && pack.allowlists.egress_by_tool[toolId]) {
    return pack.allowlists.egress_by_tool[toolId].includes(domain);
  }
  // Check global egress domains
  return pack.allowlists.egress_domains.some(
    (allowed) => domain === allowed || domain.endsWith('.' + allowed),
  );
}

function defaultPersonalPack(): PolicyPack {
  return {
    pack_id: 'policy.personal.default',
    tier: 'personal',
    version: '1.0.0',
    budgets: {
      api_requests: { period: 'month', cap: 10000 },
      content_publish: { period: 'month', cap: 5 },
    },
    approvals: {
      rules: [
        { match: { risk_level: 'high' }, requires_approval: true },
        { match: { cost_category: 'content_publish' }, requires_approval: true },
      ],
    },
    allowlists: {
      publishers: ['cloned.official'],
      tools: [],
      capabilities: [],
      egress_domains: ['localhost', '127.0.0.1'],
      egress_by_connector: {},
      egress_by_tool: {},
    },
    ui: {
      allowed_origins: ['http://localhost', 'http://127.0.0.1', 'http://[::1]'],
    },
  };
}
