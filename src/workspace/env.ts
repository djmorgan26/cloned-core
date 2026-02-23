import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { getClonedPaths } from './paths.js';

const WORKSPACE_ENV_FILE = 'env.json';

interface WorkspaceEnvFile {
  azure?: AzureEnvRecord;
}

interface AzureEnvRecord {
  keyvaultUri: string;
  clientId: string;
  tenantId: string;
  clientSecret: string;
}

export interface AzureWorkspaceCredentials {
  keyvaultUri: string;
  clientId: string;
  tenantId: string;
  clientSecret: string;
}

function resolveWorkspaceRoot(cwd: string): string | null {
  const candidate = getClonedPaths(cwd).root;
  if (existsSync(candidate)) return candidate;
  if (cwd.endsWith('.cloned') && existsSync(cwd)) return cwd;
  return null;
}

function envFilePath(workspaceRoot: string): string {
  return join(workspaceRoot, WORKSPACE_ENV_FILE);
}

/**
 * Load workspace-level environment variables (Azure credentials, etc.) into the
 * current process so subsequent commands have everything they need.
 */
export function loadWorkspaceEnv(cwd: string = process.cwd()): void {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  if (!workspaceRoot) return;
  const filePath = envFilePath(workspaceRoot);
  if (!existsSync(filePath)) return;
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as WorkspaceEnvFile;
    const azure = parsed.azure;
    if (azure) {
      if (azure.keyvaultUri && !process.env['AZURE_KEYVAULT_URI']) {
        process.env['AZURE_KEYVAULT_URI'] = azure.keyvaultUri;
      }
      if (azure.clientId && !process.env['AZURE_CLIENT_ID']) {
        process.env['AZURE_CLIENT_ID'] = azure.clientId;
      }
      if (azure.tenantId && !process.env['AZURE_TENANT_ID']) {
        process.env['AZURE_TENANT_ID'] = azure.tenantId;
      }
      if (azure.clientSecret && !process.env['AZURE_CLIENT_SECRET']) {
        process.env['AZURE_CLIENT_SECRET'] = azure.clientSecret;
      }
    }
  } catch (err) {
    console.warn('Warning: failed to load workspace env file:', (err as Error).message);
  }
}

/**
 * Persist Azure credentials to .cloned/env.json (chmod 600) so future CLI/API
 * invocations automatically pick them up.
 */
export function persistAzureWorkspaceEnv(
  workspaceRoot: string,
  secrets: AzureWorkspaceCredentials,
): string {
  const filePath = envFilePath(workspaceRoot);
  let current: WorkspaceEnvFile = {};
  if (existsSync(filePath)) {
    try {
      current = JSON.parse(readFileSync(filePath, 'utf8')) as WorkspaceEnvFile;
    } catch {
      current = {};
    }
  }
  current.azure = {
    keyvaultUri: secrets.keyvaultUri,
    clientId: secrets.clientId,
    tenantId: secrets.tenantId,
    clientSecret: secrets.clientSecret,
  };
  writeFileSync(filePath, JSON.stringify(current, null, 2), { mode: 0o600 });
  chmodSync(filePath, 0o600);
  return filePath;
}
