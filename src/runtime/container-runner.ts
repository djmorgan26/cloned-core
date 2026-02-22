import { spawn, type SpawnOptionsWithoutStdio, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PolicyPack } from '../governance/policy.js';
import { logger } from '../shared/logger.js';

export type SandboxMode = 'process' | 'container';

export interface ContainerRunnerOptions {
  dockerBin?: string;
  image?: string;
  network?: string;
  cpus?: string;
  memory?: string;
  projectRoot?: string;
  proxyUrl?: string;
  tmpDir?: string;
  spawn?: typeof spawn;
}

export interface ContainerToolRequest {
  toolId: string;
  input: Record<string, unknown>;
  ctx?: Record<string, unknown>;
  policy: PolicyPack;
  connectorId?: string;
}

interface SandboxPayload {
  tool_id: string;
  input: Record<string, unknown>;
  ctx: Record<string, unknown>;
  policy: PolicyPack;
  connector_id?: string;
}

export class DockerContainerRunner {
  private readonly projectRoot: string;
  private readonly proxyUrl?: string;
  private readonly spawnImpl: typeof spawn;

  constructor(private readonly opts: ContainerRunnerOptions = {}) {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    this.projectRoot =
      opts.projectRoot ??
      resolve(moduleDir, '..', '..');
    this.proxyUrl = opts.proxyUrl ?? process.env['CLONED_EGRESS_PROXY'];
    this.spawnImpl = opts.spawn ?? spawn;
  }

  async runTool(req: ContainerToolRequest): Promise<unknown> {
    const payload: SandboxPayload = {
      tool_id: req.toolId,
      input: req.input,
      ctx: req.ctx ?? {},
      policy: req.policy,
      connector_id: req.connectorId,
    };

    const scratchBase = this.opts.tmpDir ?? tmpdir();
    const scratchDir = mkdtempSync(join(scratchBase, 'cloned-sandbox-'));
    const containerName = `cloned_tool_${randomUUID().slice(0, 8)}`;
    const dockerArgs = this.buildDockerArgs(scratchDir, containerName);

    logger.debug('Starting sandboxed tool', {
      tool: req.toolId,
      container: containerName,
      image: this.opts.image ?? 'node:20-alpine',
    });

    try {
      const stdout = await this.execDocker(dockerArgs, payload);
      const line = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .pop();

      if (!line) return null;
      let parsed: { status: string; output?: unknown; error?: string };
      try {
        parsed = JSON.parse(line) as { status: string; output?: unknown; error?: string };
      } catch (err) {
        throw new Error(`Sandbox returned invalid JSON: ${(err as Error).message}`);
      }

      if (parsed.status !== 'ok') {
        throw new Error(parsed.error ?? 'Sandbox execution failed');
      }
      return parsed.output;
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }

  private buildDockerArgs(scratchDir: string, name: string): string[] {
    const image = this.opts.image ?? 'node:20-alpine';
    const network = this.opts.network ?? process.env['CLONED_SANDBOX_NETWORK'] ?? 'bridge';
    const cpus = this.opts.cpus ?? '1';
    const memory = this.opts.memory ?? '512m';

    const args = [
      'run',
      '--rm',
      '-i',
      '--name',
      name,
      '--network',
      network,
      '--pids-limit',
      '256',
      '--cpus',
      cpus,
      '--memory',
      memory,
      '--security-opt',
      'no-new-privileges:true',
      '--cap-drop',
      'ALL',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=64m',
      '--mount',
      `type=bind,src=${this.projectRoot},target=/workspace,ro`,
      '--mount',
      `type=bind,src=${scratchDir},target=/sandbox`,
      '--workdir',
      '/workspace',
      '--user',
      'node',
      '--env',
      `CLONED_SANDBOX=1`,
      '--env',
      `CLONED_CONTAINER_NAME=${name}`,
    ];

    if (this.proxyUrl) {
      args.push('--env', `HTTP_PROXY=${this.proxyUrl}`, '--env', `HTTPS_PROXY=${this.proxyUrl}`);
    }

    args.push(image, 'node', '/workspace/dist/runtime/container/worker.js');
    return args;
  }

  private execDocker(args: string[], payload: SandboxPayload): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = this.spawnImpl(this.opts.dockerBin ?? 'docker', args, {
        stdio: 'pipe',
      } as SpawnOptionsWithoutStdio) as ChildProcessWithoutNullStreams;

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
      child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));

      child.on('error', (err) => {
        reject(err);
      });

      child.on('close', (code) => {
        const stdoutStr = Buffer.concat(stdoutChunks).toString('utf8');
        const stderrStr = Buffer.concat(stderrChunks).toString('utf8');
        if (code !== 0) {
          const err = stderrStr.trim() || stdoutStr.trim() || 'docker run failed';
          return reject(new Error(`Sandbox exited with code ${code}: ${err}`));
        }
        return resolve(stdoutStr);
      });

      try {
        child.stdin.write(JSON.stringify(payload));
        child.stdin.end();
      } catch (err) {
        child.kill();
        reject(err);
      }
    });
  }
}

