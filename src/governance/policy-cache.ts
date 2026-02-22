import { loadPolicyPack as loadRaw } from './policy.js';
import type { PolicyPack } from './policy.js';

const cache = new Map<string, PolicyPack>();

export function loadPolicyPack(packId: string, customDir?: string): PolicyPack {
  const key = `${packId}::${customDir ?? ''}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pack = loadRaw(packId, customDir);
  cache.set(key, pack);
  return pack;
}

export function invalidatePolicyCache(packId?: string, customDir?: string): void {
  if (packId !== undefined) {
    cache.delete(`${packId}::${customDir ?? ''}`);
  } else {
    cache.clear();
  }
}
