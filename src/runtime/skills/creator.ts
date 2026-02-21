/**
 * Creator skill pack.
 * YouTube video package generation with approval-gated publishing.
 */
import type { Pipeline } from '../types.js';

export const creatorPipeline: Pipeline = {
  id: 'pipeline.creator.youtube',
  version: '1.0.0',
  name: 'YouTube Content Creator',
  description: 'Generate video package and optionally publish to YouTube with approval',
  steps: [
    {
      id: 'step.research',
      tool_id: 'cloned.mcp.web.search@v1',
      input: {
        query: '{{topic}} YouTube video ideas trends',
        max_results: 5,
      },
      constitutions: ['cap.research.web_search'],
      allowed_tools: ['cloned.mcp.web.search@v1'],
    },
    {
      id: 'step.package',
      tool_id: 'cloned.mcp.youtube.video.package@v1',
      input: {
        title: '{{title}}',
        description: '{{description}}',
        tags: '{{tags}}',
        privacy: 'private',
      },
      constitutions: ['cap.content.video_packaging'],
      allowed_tools: ['cloned.mcp.youtube.video.package@v1'],
    },
    {
      id: 'step.save_package',
      tool_id: 'cloned.internal.artifact.save@v1',
      input: {
        content: '{{step.package.output}}',
        filename: 'video-package.json',
        schema: 'artifact.video_package@v1',
      },
      allowed_tools: ['cloned.internal.artifact.save@v1'],
    },
    // Publish step is intentionally separate and requires approval
    // It should only be triggered after manual approval
    {
      id: 'step.publish_gate',
      tool_id: 'cloned.internal.approval.check@v1',
      input: {
        scope: 'content_publish',
        risk_level: 'high',
      },
      allowed_tools: ['cloned.internal.approval.check@v1'],
    },
  ],
};

export const creatorConstitution = {
  id: 'constitution.creator',
  allowed_capabilities: [
    'cap.content.video_packaging',
    'cap.research.web_search',
    'cap.identity.vault_secrets',
  ],
  denied_capabilities: ['cap.dev.repo_management'],
  publish_requires_approval: true,
  description: 'Creator constitution: content generation with approval-gated publishing',
};
