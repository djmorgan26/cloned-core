import { z } from 'zod';

export const WorkspaceConfigSchema = z.object({
  workspace_id: z.string(),
  type: z.enum(['personal', 'shared', 'enterprise']),
  policy_pack: z.string(),
  vault_provider: z.string(),
  created_at: z.string(),
  version: z.string(),
  network: z
    .object({
      egress_proxy: z.string().optional(),
    })
    .optional(),
});
