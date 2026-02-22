import { researchPipeline } from './skills/researcher.js';
import { builderPipeline } from './skills/builder.js';
import { creatorPipeline } from './skills/creator.js';
import type { Pipeline } from './types.js';

export const BUILT_IN_PIPELINES: Record<string, Pipeline> = {
  'pipeline.research.report': researchPipeline,
  'pipeline.builder.scaffold': builderPipeline,
  'pipeline.creator.youtube': creatorPipeline,
};
