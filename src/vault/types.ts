export interface VaultProvider {
  name: string;
  setSecret(key: string, value: string): Promise<void>;
  getSecret(key: string): Promise<string | null>;
  deleteSecret(key: string): Promise<void>;
  listSecrets(): Promise<Array<{ name: string; lastModified?: string }>>;
  status(): Promise<{ healthy: boolean; provider: string; message?: string }>;
}
