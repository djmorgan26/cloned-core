import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type Database from 'better-sqlite3';
import { runPipeline, registerTool } from '../runtime/runner.js';
import { createTestDb } from './test-helpers.js';
import type { Pipeline } from '../runtime/types.js';
import { loadPolicyPack } from '../governance/policy.js';

function makePolicy() {
  return loadPolicyPack('policy.personal.default');
}

function makePipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    id: 'test.pipeline',
    version: '1.0.0',
    name: 'Test Pipeline',
    description: 'Test',
    steps: [],
    ...overrides,
  };
}

describe('runPipeline', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    // Initialize budgets
    db.prepare(
      `INSERT INTO budgets (workspace_id, category, period, cap, window_start, used)
       VALUES ('ws1', 'api_requests', 'month', 10000, datetime('now'), 0)`,
    ).run();
  });

  afterEach(() => {
    db.close();
  });

  it('runs an empty pipeline and returns succeeded', async () => {
    const result = await runPipeline(makePipeline({ steps: [] }), {
      db,
      workspaceId: 'ws1',
      policy: makePolicy(),
      actor: 'test',
      dryRun: false,
      cwd: process.cwd(),
    });
    expect(result.status).toBe('succeeded');
    expect(result.steps).toHaveLength(0);
  });

  it('executes a registered tool successfully', async () => {
    registerTool('test.echo@v1', async (input) => ({ echoed: input }));

    const result = await runPipeline(
      makePipeline({
        steps: [{ id: 'step1', tool_id: 'test.echo@v1', input: { msg: 'hello' } }],
      }),
      {
        db,
        workspaceId: 'ws1',
        policy: makePolicy(),
        actor: 'test',
        dryRun: false,
        cwd: process.cwd(),
      },
    );

    expect(result.status).toBe('succeeded');
    expect(result.steps[0]?.outcome).toBe('success');
    expect((result.steps[0] as { output?: Record<string, unknown> }).output).toEqual({
      echoed: { msg: 'hello' },
    });
  });

  it('stops pipeline on step failure', async () => {
    registerTool('test.fail@v1', async () => {
      throw new Error('Tool error');
    });
    registerTool('test.after@v1', async () => ({ ran: true }));

    const result = await runPipeline(
      makePipeline({
        steps: [
          { id: 'step1', tool_id: 'test.fail@v1', input: {} },
          { id: 'step2', tool_id: 'test.after@v1', input: {} },
        ],
      }),
      {
        db,
        workspaceId: 'ws1',
        policy: makePolicy(),
        actor: 'test',
        dryRun: false,
        cwd: process.cwd(),
      },
    );

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(1); // step2 never ran
  });

  it('dry-run succeeds without calling handler', async () => {
    let called = false;
    registerTool('test.noop@v1', async () => {
      called = true;
      return {};
    });

    const result = await runPipeline(
      makePipeline({
        steps: [{ id: 'step1', tool_id: 'test.noop@v1', input: {} }],
      }),
      {
        db,
        workspaceId: 'ws1',
        policy: makePolicy(),
        actor: 'test',
        dryRun: true,
        cwd: process.cwd(),
      },
    );

    expect(result.status).toBe('succeeded');
    expect(called).toBe(false);
  });

  it('blocks tool not in step allowlist', async () => {
    registerTool('test.blocked@v1', async () => ({}));

    const result = await runPipeline(
      makePipeline({
        steps: [
          {
            id: 'step1',
            tool_id: 'test.blocked@v1',
            input: {},
            allowed_tools: ['other.tool@v1'],
          },
        ],
      }),
      {
        db,
        workspaceId: 'ws1',
        policy: makePolicy(),
        actor: 'test',
        dryRun: false,
        cwd: process.cwd(),
      },
    );

    expect(result.steps[0]?.outcome).toBe('blocked');
  });

  it('unknown tool in non-dry-run fails the step', async () => {
    const result = await runPipeline(
      makePipeline({
        steps: [{ id: 'step1', tool_id: 'no.such.tool@v1', input: {} }],
      }),
      {
        db,
        workspaceId: 'ws1',
        policy: makePolicy(),
        actor: 'test',
        dryRun: false,
        cwd: process.cwd(),
      },
    );

    expect(result.steps[0]?.outcome).toBe('failure');
  });

  it('resolves template variables in step input', async () => {
    let capturedInput: Record<string, unknown> = {};
    registerTool('test.capture@v1', async (input) => {
      capturedInput = input;
      return { done: true };
    });

    await runPipeline(
      makePipeline({
        steps: [
          {
            id: 'step1',
            tool_id: 'test.capture@v1',
            input: { greeting: '{{msg}}' },
          },
        ],
      }),
      {
        db,
        workspaceId: 'ws1',
        policy: makePolicy(),
        actor: 'test',
        dryRun: false,
        vars: { msg: 'hello world' },
        cwd: process.cwd(),
      },
    );

    expect(capturedInput['greeting']).toBe('hello world');
  });
});
