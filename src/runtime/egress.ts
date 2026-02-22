/**
 * Egress enforcement per docs/runtime/egress-matching.md
 * Default-deny outbound; allows only policy-specified domains.
 */
import type { PolicyPack } from '../governance/policy.js';

export interface EgressCheckResult {
  allowed: boolean;
  matched_rule?: string;
  reason?: string;
}

/**
 * Convert hostname to a normalized form for matching.
 * Handles punycode-style normalization and lowercasing.
 */
function normalizeHost(host: string): string {
  try {
    // Use URL to normalize
    const u = new URL(`http://${host}`);
    return u.hostname.toLowerCase();
  } catch {
    return host.toLowerCase();
  }
}

/**
 * Check if a host matches an allowlist entry.
 * Supports:
 *   - Exact match: "api.example.com"
 *   - Wildcard: "*.example.com" (single-label prefix only)
 *   - Loopback special cases
 */
function matchesEntry(host: string, entry: string): boolean {
  const normalHost = normalizeHost(host);
  const normalEntry = normalizeHost(entry);

  if (normalEntry === normalHost) return true;

  // Wildcard: *.example.com
  if (normalEntry.startsWith('*.')) {
    const suffix = normalEntry.slice(2); // example.com
    // Must be exactly one label prepended: api.example.com not a.api.example.com
    if (normalHost.endsWith('.' + suffix)) {
      const prefix = normalHost.slice(0, normalHost.length - suffix.length - 1);
      if (!prefix.includes('.')) return true;
    }
  }

  return false;
}

function isLoopback(host: string): boolean {
  const h = normalizeHost(host);
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
}

/**
 * Check if outbound egress to a host is allowed per policy.
 */
export function checkEgress(
  host: string,
  policy: PolicyPack,
  opts?: { connectorId?: string; toolId?: string },
): EgressCheckResult {
  // Loopback always allowed
  if (isLoopback(host)) {
    return { allowed: true, matched_rule: 'loopback' };
  }

  // IP literals blocked by default (unless explicitly listed)
  const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || /^\[?[0-9a-fA-F:]+\]?$/.test(host);
  if (isIp && !isLoopback(host)) {
    // Check if explicitly in global allowlist
    const inGlobal = policy.allowlists.egress_domains.some((e) => matchesEntry(host, e));
    if (!inGlobal) {
      return {
        allowed: false,
        reason: `IP literal ${host} blocked – add to egress_domains allowlist if required`,
      };
    }
  }

  // Tool-specific allowlist
  if (opts?.toolId) {
    const toolList = policy.allowlists.egress_by_tool[opts.toolId];
    if (toolList) {
      const matched = toolList.find((e) => matchesEntry(host, e));
      if (matched) return { allowed: true, matched_rule: `egress_by_tool[${opts.toolId}]=${matched}` };
      return {
        allowed: false,
        reason: `Host ${host} not in egress_by_tool allowlist for ${opts.toolId}`,
      };
    }
  }

  // Connector-specific allowlist
  if (opts?.connectorId) {
    const connList = policy.allowlists.egress_by_connector[opts.connectorId];
    if (connList) {
      const matched = connList.find((e) => matchesEntry(host, e));
      if (matched)
        return { allowed: true, matched_rule: `egress_by_connector[${opts.connectorId}]=${matched}` };
      return {
        allowed: false,
        reason: `Host ${host} not in egress_by_connector allowlist for ${opts.connectorId}`,
      };
    }
  }

  // Global egress domains
  const globalMatch = policy.allowlists.egress_domains.find((e) => matchesEntry(host, e));
  if (globalMatch) {
    return { allowed: true, matched_rule: `egress_domains=${globalMatch}` };
  }

  return {
    allowed: false,
    reason: `Host ${host} not in any egress allowlist (default-deny)`,
  };
}
