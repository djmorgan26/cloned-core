/**
 * Researcher skill pack.
 * Performs deep research with citations and produces a markdown artifact.
 */
import type { Pipeline } from '../types.js';

export const researchPipeline: Pipeline = {
  id: 'pipeline.research.report',
  version: '1.0.0',
  name: 'Deep Research Report',
  description: 'Research a topic using web search and produce a cited markdown report',
  steps: [
    {
      id: 'step.search',
      tool_id: 'cloned.mcp.web.search@v1',
      input: {
        query: '{{topic}}',
        max_results: 10,
      },
      constitutions: ['cap.research.web_search'],
      allowed_tools: ['cloned.mcp.web.search@v1'],
    },
    {
      id: 'step.synthesize',
      tool_id: 'cloned.internal.synthesis@v1',
      input: {
        topic: '{{topic}}',
        sources: '{{step.search.output}}',
        format: 'markdown',
        include_citations: true,
      },
      constitutions: ['cap.research.deep_research'],
      allowed_tools: ['cloned.internal.synthesis@v1'],
    },
    {
      id: 'step.save_artifact',
      tool_id: 'cloned.internal.artifact.save@v1',
      input: {
        content: '{{step.synthesize.output}}',
        filename: 'research-report.md',
        schema: 'artifact.research@v1',
      },
      allowed_tools: ['cloned.internal.artifact.save@v1'],
    },
  ],
};

export const researchConstitution = {
  id: 'constitution.researcher',
  allowed_capabilities: ['cap.research.web_search', 'cap.research.deep_research'],
  denied_capabilities: ['cap.content.video_publish', 'cap.dev.repo_management'],
  description: 'Researcher constitution: read-only research tasks only',
};
