import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { load, dump } from 'js-yaml';

export interface ConnectorEntry {
  id: string;
  version: string;
  publisher_id: string;
  enabled: boolean;
  installed_at: string;
  manifest_path?: string;
  capabilities_provided: string[];
  signature?: string;
  integrity_hash?: string;
}

export interface Registry {
  schema: string;
  version: string;
  connectors: ConnectorEntry[];
}

export function loadRegistry(registryPath: string): Registry {
  if (!existsSync(registryPath)) {
    return { schema: 'registry.schema.json', version: '1.0.0', connectors: [] };
  }
  const raw = readFileSync(registryPath, 'utf8');
  return load(raw) as Registry;
}

export function saveRegistry(registryPath: string, registry: Registry): void {
  writeFileSync(registryPath, dump(registry), 'utf8');
}

export function getConnector(registry: Registry, id: string): ConnectorEntry | undefined {
  return registry.connectors.find((c) => c.id === id);
}

export function enableConnector(registry: Registry, id: string): boolean {
  const conn = getConnector(registry, id);
  if (!conn) return false;
  conn.enabled = true;
  return true;
}

export function disableConnector(registry: Registry, id: string): boolean {
  const conn = getConnector(registry, id);
  if (!conn) return false;
  conn.enabled = false;
  return true;
}

export function listEnabledConnectors(registry: Registry): ConnectorEntry[] {
  return registry.connectors.filter((c) => c.enabled);
}

export function addConnector(registry: Registry, entry: ConnectorEntry): void {
  const existing = registry.connectors.findIndex((c) => c.id === entry.id);
  if (existing >= 0) {
    registry.connectors[existing] = entry;
  } else {
    registry.connectors.push(entry);
  }
}
