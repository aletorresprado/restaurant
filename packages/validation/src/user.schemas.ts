import { z } from 'zod';
import { Role } from '@repo/shared-types';

// ─────────────────────────────────────────────────────────────
// Utilidades compartidas
// ─────────────────────────────────────────────────────────────

const firstNameSchema = z
  .string()
  .trim()
  .min(1, 'El nombre no puede estar vacío')
  .max(100, 'El nombre no puede superar 100 caracteres');

const lastNameSchema = z
  .string()
  .trim()
  .min(1, 'El apellido no puede estar vacío')
  .max(100, 'El apellido no puede superar 100 caracteres');

const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[\d\s\-().]{7,20}$/,
    'El teléfono debe tener un formato válido (mín. 7, máx. 20 caracteres)',
  );

// ─────────────────────────────────────────────────────────────
// UpdateProfileSchema — PATCH /me
//
// Usado por el propio usuario para actualizar su perfil.
// email es INMUTABLE: cambiar el email afecta autenticación y
// requiere un flujo de verificación independiente.
// password NO se actualiza aquí — usar ChangePasswordSchema.
// ─────────────────────────────────────────────────────────────

export const UpdateProfileSchema = z.object({
  firstName: firstNameSchema.optional(),
  lastName: lastNameSchema.optional(),
  phone: phoneSchema.optional().nullable(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

// ─────────────────────────────────────────────────────────────
// AdminUpdateUserSchema — PATCH /admin/users/:id
//
// Permite a ADMIN modificar datos de perfil y rol de un usuario.
// isActive NO se incluye aquí: la activación/desactivación tiene
// su propio endpoint (PATCH /admin/users/:id/status) para mantener
// una única vía explícita y auditable para esa operación.
// ─────────────────────────────────────────────────────────────

export const AdminUpdateUserSchema = z.object({
  firstName: firstNameSchema.optional(),
  lastName: lastNameSchema.optional(),
  phone: phoneSchema.optional().nullable(),
  // z.nativeEnum(Role) usa el enum de @repo/shared-types como única fuente
  // de verdad. No se duplican los valores aquí.
  role: z.nativeEnum(Role).optional(),
});

export type AdminUpdateUserDto = z.infer<typeof AdminUpdateUserSchema>;

// ─────────────────────────────────────────────────────────────
// UpdateUserStatusSchema — PATCH /admin/users/:id/status
//
// Única vía para activar o desactivar una cuenta de usuario.
// Endpoint separado para que la acción sea explícita y auditable.
// ─────────────────────────────────────────────────────────────

export const UpdateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateUserStatusDto = z.infer<typeof UpdateUserStatusSchema>;

// ─────────────────────────────────────────────────────────────
// AdminLoyaltyAdjustmentSchema — PATCH /admin/users/:id/loyalty
//
// Genera una LoyaltyTransaction de tipo MANUAL_ADJUSTMENT.
// No modifica ningún contador directamente.
// performedById se extrae del JWT en el backend, nunca del body.
// El balance resultante nunca puede quedar por debajo de 0
// (validado en la capa de servicio).
// ─────────────────────────────────────────────────────────────

export const AdminLoyaltyAdjustmentSchema = z.object({
  amount: z
    .number()
    .int('El amount debe ser un número entero')
    .refine((v) => v !== 0, { message: 'El amount no puede ser 0' }),
  reason: z
    .string()
    .trim()
    .min(5, 'El motivo debe tener al menos 5 caracteres')
    .max(500, 'El motivo no puede superar 500 caracteres'),
});

export type AdminLoyaltyAdjustmentDto = z.infer<typeof AdminLoyaltyAdjustmentSchema>;

// ─────────────────────────────────────────────────────────────
// ListUsersQuerySchema — GET /admin/users
//
// Parámetros de paginación y filtrado para la lista de usuarios.
// ─────────────────────────────────────────────────────────────

export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  // z.nativeEnum(Role) — fuente de verdad única en @repo/shared-types
  role: z.nativeEnum(Role).optional(),
  // isActive llega como query string. Parser explícito: solo acepta
  // los strings "true" o "false" y los transforma a boolean.
  // z.coerce.boolean() evalúa cualquier string no vacío como true,
  // incluyendo el literal "false", lo que produce resultados ambiguos.
  isActive: z
    .string()
    .transform((val, ctx) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Debe ser "true" o "false"',
      });
      return z.NEVER;
    })
    .optional(),
});

export type ListUsersQueryDto = z.infer<typeof ListUsersQuerySchema>;
