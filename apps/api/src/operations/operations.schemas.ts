import { z } from 'zod';
import { UpdateRestaurantTableSchema } from '@repo/validation';
export const DateSchema = z.string().date();
export const HoursQuerySchema = z.object({ date: DateSchema });
export const TablePatchSchema = UpdateRestaurantTableSchema.strict().refine(v => Object.keys(v).length > 0, 'Enviar al menos un campo');
export const ListQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
