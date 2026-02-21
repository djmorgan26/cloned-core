import { describe, it, expect } from '@jest/globals';
import { checkEgress } from '../runtime/egress.js';
import type { PolicyPack } from '../governance/policy.js';

function makePack(egress_domains: string[], by_connector: Record<string, string[]> = {}, by_tool: Record<string, string[]> = {}): PolicyPack {
  return {
    pack_id: 'test',
    tier: 'personal',
    version: '1.0.0',
    budgets: {},
    approvals: { rules: [] },
    allowlists: {
      publishers: [],
      tools: [],
      capabilities: [],
      egress_domains,
      egress_by_connector: by_connector,
      egress_by_tool: by_tool,
    },
    ui: { allowed_origins: [] },
  };
}

describe('Egress enforcement', () => {
  it('allows loopback by default', () => {
    const pack = makePack([]);
    expect(checkEgress('127.0.0.1', pack).allowed).toBe(true);
    expect(checkEgress('localhost', pack).allowed).toBe(true);
    expect(checkEgress('::1', pack).allowed).toBe(true);
  });

  it('allows exact host match', () => {
    const pack = makePack(['api.example.com']);
    expect(checkEgress('api.example.com', pack).allowed).toBe(true);
  });

  it('denies unlisted host', () => {
    const pack = makePack(['api.example.com']);
    const result = checkEgress('evil.attacker.com', pack);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('default-deny');
  });

  it('allows wildcard subdomain match', () => {
    const pack = makePack(['*.example.com']);
    expect(checkEgress('api.example.com', pack).allowed).toBe(true);
    expect(checkEgress('cdn.example.com', pack).allowed).toBe(true);
  });

  it('does NOT allow multi-level subdomain via single wildcard', () => {
    const pack = makePack(['*.example.com']);
    // a.b.example.com should NOT match *.example.com
    expect(checkEgress('a.b.example.com', pack).allowed).toBe(false);
  });

  it('blocks IP literals not in allowlist', () => {
    const pack = makePack(['api.example.com']);
    const result = checkEgress('93.184.216.34', pack);
    expect(result.allowed).toBe(false);
  });

  it('allows IP literal explicitly listed', () => {
    const pack = makePack(['93.184.216.34']);
    expect(checkEgress('93.184.216.34', pack).allowed).toBe(true);
  });

  it('uses tool-specific allowlist when toolId provided', () => {
    const pack = makePack([], {}, { 'my.tool@v1': ['api.github.com'] });
    expect(checkEgress('api.github.com', pack, { toolId: 'my.tool@v1' }).allowed).toBe(true);
    expect(checkEgress('evil.com', pack, { toolId: 'my.tool@v1' }).allowed).toBe(false);
  });

  it('uses connector-specific allowlist when connectorId provided', () => {
    const pack = makePack([], { 'connector.github.app': ['api.github.com'] });
    expect(checkEgress('api.github.com', pack, { connectorId: 'connector.github.app' }).allowed).toBe(true);
    expect(checkEgress('evil.com', pack, { connectorId: 'connector.github.app' }).allowed).toBe(false);
  });
});
