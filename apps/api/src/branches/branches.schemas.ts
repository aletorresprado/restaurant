import { z } from 'zod';
import { UpdateBranchSchema } from '@repo/validation';

export const BranchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type BranchQuery = z.infer<typeof BranchQuerySchema>;
export const BranchPatchSchema = UpdateBranchSchema.strict().refine(v => Object.keys(v).length > 0, 'Enviar al menos un campo');
export const UserRoleSchema = z.object({ role: z.enum(['CUSTOMER', 'STAFF']) }).strict();
