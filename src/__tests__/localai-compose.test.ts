import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

describe('LocalAI compose hardening', () => {
  const composePath = 'docker/compose.local-llm.yaml';
  const compose = load(readFileSync(composePath, 'utf8')) as Record<string, any>;
  const service = compose?.services?.localai ?? {};

  it('binds port 8080 to loopback only', () => {
    expect(service.ports).toContain('127.0.0.1:8080:8080');
  });

  it('enforces read-only rootfs with tmpfs exception', () => {
    expect(service.read_only).toBe(true);
    expect(Array.isArray(service.tmpfs)).toBe(true);
    expect(service.tmpfs.join(' ')).toContain('/tmp');
    expect(service.tmpfs.join(' ')).toContain('noexec');
  });

  it('drops capabilities and disables privilege escalation', () => {
    expect(service.security_opt).toContain('no-new-privileges:true');
    expect(service.cap_drop).toContain('ALL');
  });

  it('runs as non-root and limits pid/memory/cpu', () => {
    expect(service.user).toMatch(/\d+:\d+/);
    expect(service.pids_limit).toBeGreaterThan(0);
    expect(service.mem_limit).toBe('8g');
    expect(service.cpus).toBe(4);
  });

  it('defines a healthcheck against /health', () => {
    expect(service.healthcheck).toBeDefined();
    const testCmd = service.healthcheck.test.join(' ');
    expect(testCmd).toContain('/health');
  });
});
