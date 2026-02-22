export type WorkspaceTier = 'personal' | 'shared' | 'enterprise';

export interface WorkspaceConfig {
  workspace_id: string;
  type: WorkspaceTier;
  policy_pack: string;
  vault_provider: string;
  created_at: string;
  version: string;
  network?: {
    egress_proxy?: string;
  };
}

export interface ClonedPaths {
  root: string;         // .cloned/
  config: string;       // .cloned/config.yaml
  stateDb: string;      // .cloned/state.db
  auditLog: string;     // .cloned/audit.log
  registry: string;     // .cloned/registry.yaml
  trustDir: string;     // .cloned/trust/
  policyDir: string;    // .cloned/policy/
  artifactsDir: string; // .cloned/artifacts/
}
