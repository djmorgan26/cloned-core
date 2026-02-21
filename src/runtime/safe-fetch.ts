/**
 * Egress-enforced fetch wrapper.
 * Every outbound HTTP request from a tool handler MUST go through this.
 * Calls checkEgress() before making the actual fetch; throws EgressBlockedError if denied.
 */
import { checkEgress } from './egress.js';
import type { PolicyPack } from '../governance/policy.js';
import { logger } from '../shared/logger.js';

export class EgressBlockedError extends Error {
  readonly host: string;
  readonly reason: string;

  constructor(host: string, reason: string) {
    super(`Egress blocked to ${host}: ${reason}`);
    this.name = 'EgressBlockedError';
    this.host = host;
    this.reason = reason;
  }
}

export type SafeFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Returns a fetch function that enforces egress policy before every request.
 * Pass the result into tool handlers so they can't bypass egress enforcement.
 */
export function makeSafeFetch(
  policy: PolicyPack,
  opts?: { connectorId?: string; toolId?: string },
): SafeFetch {
  return async function safeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
    const href = typeof url === 'string' ? url : url.href;
    let host: string;
    try {
      host = new URL(href).hostname;
    } catch {
      throw new EgressBlockedError(String(url), 'Invalid URL');
    }

    const result = checkEgress(host, policy, opts);
    if (!result.allowed) {
      logger.warn('Egress blocked', { host, reason: result.reason, toolId: opts?.toolId });
      throw new EgressBlockedError(host, result.reason ?? 'Policy default-deny');
    }

    logger.debug('Egress allowed', { host, rule: result.matched_rule, toolId: opts?.toolId });
    return fetch(url, init);
  };
}
