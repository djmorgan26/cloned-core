import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { DockerContainerRunner } from '../runtime/container-runner.js';
import type { PolicyPack } from '../governance/policy.js';

function createPolicy(): PolicyPack {
  return {
    pack_id: 'policy.personal.default',
    tier: 'personal',
    version: '1.0.0',
    budgets: {},
    approvals: { rules: [] },
    allowlists: {
      publishers: [],
      tools: [],
      capabilities: [],
      egress_domains: ['localhost'],
      egress_by_connector: {},
      egress_by_tool: {},
    },
    ui: { allowed_origins: [] },
  };
}

function createMockChild(payloads: string[]): ChildProcessWithoutNullStreams {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  stdin.on('data', (chunk) => payloads.push(chunk.toString('utf8')));

  const child = new EventEmitter() as ChildProcessWithoutNullStreams & {
    kill: jest.Mock;
  };
  Object.assign(child, {
    stdout,
    stderr,
    stdin,
    killed: false,
    pid: 123,
    connected: true,
    exitCode: null,
    signalCode: null,
    spawnfile: 'docker',
    spawnargs: [],
    kill: jest.fn(() => true),
    ref: () => child,
    unref: () => child,
    send: () => false,
  });

  return child;
}

describe('DockerContainerRunner', () => {
  it('passes payload via stdin and enforces docker hardening flags', async () => {
    const payloads: string[] = [];
    const child = createMockChild(payloads);
    const spawnMock = jest.fn(() => child);
    type SpawnFn = typeof import('node:child_process').spawn;
    const runner = new DockerContainerRunner({
      projectRoot: '/repo',
      spawn: spawnMock as unknown as SpawnFn,
      proxyUrl: 'http://127.0.0.1:8088',
      image: 'node:20-alpine',
      network: 'sandbox_net',
      cpus: '0.5',
      memory: '256m',
    });

    const runPromise = runner.runTool({
      toolId: 'cloned.test.tool@v1',
      input: { foo: 'bar' },
      ctx: { token: 'secret' },
      policy: createPolicy(),
      connectorId: 'connector.test',
    });

    setImmediate(() => {
      (child.stdout as PassThrough).write('{"status":"ok","output":{"done":true}}');
      (child.stdout as PassThrough).end();
      (child.stderr as PassThrough).end();
      child.emit('close', 0);
    });

    await expect(runPromise).resolves.toEqual({ done: true });

    const firstCall = spawnMock.mock.calls[0];
    if (!firstCall) {
      throw new Error('docker spawn not invoked');
    }
    if (firstCall.length < 2) {
      throw new Error('docker spawn missing args array');
    }
    const [, argsRaw] = firstCall as unknown as [string, string[], unknown?];
    const args = argsRaw;
    expect(args).toContain('-i');
    expect(args).toContain('--read-only');
    expect(args).toContain('--tmpfs');
    expect(args).toContain('/workspace/dist/runtime/container/worker.js');
    expect(args).toContain('node:20-alpine');
    expect(args).toContain('--env');
    expect(args).toContain('CLONED_SANDBOX=1');

    const combinedPayload = payloads.join('');
    expect(combinedPayload).toContain('"tool_id":"cloned.test.tool@v1"');
    expect(combinedPayload).toContain('"connector_id":"connector.test"');
    expect(combinedPayload).toContain('"policy"');
  });
});
