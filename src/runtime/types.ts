export type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface RunRecord {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  status: RunStatus;
  started_at: string;
  ended_at: string | null;
  created_by: string | null;
  dry_run: boolean;
}

export interface SkillStep {
  id: string;
  tool_id: string;
  input: Record<string, unknown>;
  constitutions?: string[];   // Allowed capabilities for this step
  allowed_tools?: string[];   // Allowlist of tool IDs
  dry_run?: boolean;
}

export interface Pipeline {
  id: string;
  version: string;
  name: string;
  description?: string;
  steps: SkillStep[];
}

export interface StepResult {
  step_id: string;
  tool_id: string;
  outcome: 'success' | 'failure' | 'blocked' | 'skipped';
  output?: unknown;
  error?: string;
  blocked_reason?: string;
}

export interface RunResult {
  run_id: string;
  pipeline_id: string;
  status: RunStatus;
  steps: StepResult[];
  artifact_paths: string[];
  started_at: string;
  ended_at: string;
}
