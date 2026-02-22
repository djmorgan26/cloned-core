import { describe, it, expect } from '@jest/globals';
import { selectBlueprint, generatePlanOfRecord } from '../blueprint/engine.js';
import { resolveCapabilities, buildCapabilityGraph } from '../capability/graph.js';
import type { Blueprint } from '../blueprint/engine.js';

function makeBlueprint(overrides: Partial<Blueprint> = {}): Blueprint {
  return {
    id: 'test.blueprint',
    version: '1.0.0',
    title: 'Test Blueprint',
    description: 'A test blueprint',
    goals: ['research topics', 'analyze data'],
    required_capabilities: [],
    preferred_connectors: [],
    policy_pack: 'policy.personal.default',
    ...overrides,
  };
}

describe('selectBlueprint', () => {
  it('returns null when no blueprints match', () => {
    const bp = makeBlueprint({ goals: ['publish videos', 'create content'] });
    const result = selectBlueprint([bp], ['write code']);
    expect(result).toBeNull();
  });

  it('returns matching blueprint', () => {
    const bp = makeBlueprint({ goals: ['research topics', 'find information'] });
    const result = selectBlueprint([bp], ['research a topic']);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('test.blueprint');
  });

  it('returns best match when multiple blueprints', () => {
    const research = makeBlueprint({ id: 'research', goals: ['research topics', 'web search'] });
    const creator = makeBlueprint({ id: 'creator', goals: ['publish videos', 'youtube content'] });
    const result = selectBlueprint([research, creator], ['research a topic on the web']);
    expect(result?.id).toBe('research');
  });

  it('returns null for empty blueprints list', () => {
    expect(selectBlueprint([], ['anything'])).toBeNull();
  });
});

describe('resolveCapabilities', () => {
  it('throws on circular prerequisites', () => {
    // Build a minimal graph with a cycle
    const cycleGraph = {
      capabilities: new Map([
        ['cap.a', { capability: { id: 'cap.a', description: '', risk_level: 'low' as const, cost_model: 'none' as const, required_approvals: [], prerequisites: ['cap.b'] }, provided_by: [] }],
        ['cap.b', { capability: { id: 'cap.b', description: '', risk_level: 'low' as const, cost_model: 'none' as const, required_approvals: [], prerequisites: ['cap.a'] }, provided_by: [] }],
      ]),
    };
    expect(() => resolveCapabilities(cycleGraph, ['cap.a'])).toThrow('Circular');
  });

  it('resolves transitive prerequisites without duplicates', () => {
    const graph = buildCapabilityGraph();
    const resolved = resolveCapabilities(graph, ['cap.content.video_publish']);
    // video_publish requires: video_packaging, vault_secrets
    expect(resolved).toContain('cap.content.video_publish');
    expect(resolved).toContain('cap.content.video_packaging');
    expect(resolved).toContain('cap.identity.vault_secrets');
    // No duplicates
    expect(new Set(resolved).size).toBe(resolved.length);
  });
});

describe('generatePlanOfRecord', () => {
  it('generates markdown with required sections', () => {
    const bp = makeBlueprint({
      required_capabilities: ['cap.research.web_search'],
    });
    const plan = generatePlanOfRecord(bp, 'ws-test');
    expect(plan.markdown).toContain('# Plan of Record');
    expect(plan.markdown).toContain('Test Blueprint');
    expect(plan.markdown).toContain('ws-test');
    expect(plan.required_capabilities).toContain('cap.research.web_search');
  });
});
