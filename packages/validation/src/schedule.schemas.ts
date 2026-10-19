import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida formato "HH:MM" (00:00 – 23:59).
 * Soporta horarios que cruzan medianoche (ej: openingTime=22:00, closingTime=02:00).
 * La semántica de "día siguiente" se resuelve en el servicio.
 */
const timeString = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):([0-5]\d)$/,
    'Formato de hora inválido. Use HH:MM (ej: 09:00, 23:30)',
  );

// ─────────────────────────────────────────────────────────────────────────────
// CREATE BRANCH SCHEDULE
// dayOfWeek: ISO 8601 — 1=lunes … 7=domingo
// Valida opening !== closing porque ambos campos son obligatorios en CREATE.
// ─────────────────────────────────────────────────────────────────────────────

export const CreateBranchScheduleSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    openingTime: timeString,
    closingTime: timeString,
    reservationIntervalMinutes: z.number().int().min(15).max(120).default(30),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.openingTime !== data.closingTime, {
    message: 'El horario de apertura y cierre no pueden ser iguales',
    path: ['closingTime'],
  });

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE BRANCH SCHEDULE (PATCH)
// Todos los campos opcionales.
// opening !== closing se valida solo cuando AMBOS vienen en el payload.
// Si viene uno solo, la consistencia final se verifica en el servicio.
// ─────────────────────────────────────────────────────────────────────────────

export const UpdateBranchScheduleSchema = z
  .object({
    openingTime: timeString.optional(),
    closingTime: timeString.optional(),
    reservationIntervalMinutes: z.number().int().min(15).max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.openingTime !== undefined && data.closingTime !== undefined) {
        return data.openingTime !== data.closingTime;
      }
      return true;
    },
    {
      message: 'El horario de apertura y cierre no pueden ser iguales',
      path: ['closingTime'],
    },
  );

// ─────────────────────────────────────────────────────────────────────────────
// CREATE BRANCH SCHEDULE EXCEPTION
// En CREATE, si isClosed=false deben venir ambos horarios (estado inicial completo).
// ─────────────────────────────────────────────────────────────────────────────

export const CreateBranchScheduleExceptionSchema = z
  .object({
    date: z.string().date('Formato de fecha inválido. Use YYYY-MM-DD'),
    isClosed: z.boolean().default(false),
    openingTime: timeString.optional(),
    closingTime: timeString.optional(),
    reason: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.isClosed) {
      if (!data.openingTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'openingTime es requerido cuando la sucursal no está cerrada',
          path: ['openingTime'],
        });
      }
      if (!data.closingTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'closingTime es requerido cuando la sucursal no está cerrada',
          path: ['closingTime'],
        });
      }
      if (data.openingTime && data.closingTime && data.openingTime === data.closingTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El horario de apertura y cierre no pueden ser iguales',
          path: ['closingTime'],
        });
      }
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE BRANCH SCHEDULE EXCEPTION (PATCH)
//
// Zod valida ÚNICAMENTE lo que puede comprobarse con el payload recibido:
//   ✓ openingTime !== closingTime cuando ambos vienen juntos.
//
// Zod NO valida (depende del estado en DB):
//   ✗ Que existan openingTime/closingTime cuando isClosed=false.
//   ✗ La consistencia final del estado resultante (existing + patch).
//   → Ambas se validan en el servicio después de combinar existing + patch.
// ─────────────────────────────────────────────────────────────────────────────

export const UpdateBranchScheduleExceptionSchema = z
  .object({
    isClosed: z.boolean().optional(),
    openingTime: timeString.optional(),
    closingTime: timeString.optional(),
    reason: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.openingTime !== undefined && data.closingTime !== undefined) {
        return data.openingTime !== data.closingTime;
      }
      return true;
    },
    {
      message: 'El horario de apertura y cierre no pueden ser iguales',
      path: ['closingTime'],
    },
  );

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS INFERIDOS
// ─────────────────────────────────────────────────────────────────────────────

export type CreateBranchScheduleDto = z.infer<typeof CreateBranchScheduleSchema>;
export type UpdateBranchScheduleDto = z.infer<typeof UpdateBranchScheduleSchema>;
export type CreateBranchScheduleExceptionDto = z.infer<typeof CreateBranchScheduleExceptionSchema>;
export type UpdateBranchScheduleExceptionDto = z.infer<typeof UpdateBranchScheduleExceptionSchema>;
