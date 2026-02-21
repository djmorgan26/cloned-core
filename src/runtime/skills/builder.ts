/**
 * Builder skill pack.
 * Scaffolds a new app/repo with security basics and CI.
 */
import type { Pipeline } from '../types.js';

export const builderPipeline: Pipeline = {
  id: 'pipeline.builder.scaffold',
  version: '1.0.0',
  name: 'App/Repo Scaffolding',
  description: 'Scaffold a new application repository with security basics and CI',
  steps: [
    {
      id: 'step.plan',
      tool_id: 'cloned.internal.scaffold.plan@v1',
      input: {
        app_name: '{{app_name}}',
        stack: '{{stack}}',
        include_ci: true,
        include_security: true,
      },
      constitutions: ['cap.dev.repo_management'],
      allowed_tools: ['cloned.internal.scaffold.plan@v1'],
    },
    {
      id: 'step.create_repo',
      tool_id: 'cloned.mcp.github.repo.create@v1',
      input: {
        name: '{{app_name}}',
        private: true,
        description: '{{description}}',
      },
      constitutions: ['cap.dev.repo_management'],
      allowed_tools: ['cloned.mcp.github.repo.create@v1'],
    },
    {
      id: 'step.push_scaffold',
      tool_id: 'cloned.internal.scaffold.push@v1',
      input: {
        repo: '{{step.create_repo.output}}',
        plan: '{{step.plan.output}}',
      },
      allowed_tools: ['cloned.internal.scaffold.push@v1'],
    },
    {
      id: 'step.create_issue',
      tool_id: 'cloned.mcp.github.issue.create@v1',
      input: {
        owner: '{{owner}}',
        repo: '{{app_name}}',
        title: 'Scaffolding complete – review checklist',
        body: '{{step.plan.output.checklist}}',
        labels: ['setup', 'security'],
      },
      constitutions: ['cap.dev.issue_tracking'],
      allowed_tools: ['cloned.mcp.github.issue.create@v1'],
    },
  ],
};

export const builderConstitution = {
  id: 'constitution.builder',
  allowed_capabilities: [
    'cap.dev.repo_management',
    'cap.dev.issue_tracking',
    'cap.dev.ci_setup',
    'cap.identity.vault_secrets',
  ],
  denied_capabilities: ['cap.content.video_publish', 'cap.comm.slack_posting'],
  description: 'Builder constitution: development and repo operations only',
};
