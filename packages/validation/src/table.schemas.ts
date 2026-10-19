import { z } from 'zod';
import { TableStatus } from '@repo/shared-types';

// ─────────────────────────────────────────────────────────────
// RestaurantTable
//
// tableStatus es la única fuente de verdad sobre el estado de una mesa:
//   ACTIVE        → operativa, disponible para reservas
//   BLOCKED       → bloqueada administrativamente (decisión explícita del admin)
//   OUT_OF_SERVICE → fuera de servicio (rotura, mantenimiento mayor)
//
// Los bloqueos temporales (mantenimiento corto, eventos, etc.) se gestionan
// mediante TableBlock y son considerados por el motor de disponibilidad.
//
// isActive fue eliminado: tableStatus cubre todos los estados necesarios
// sin redundancia. Una mesa "inactiva" es simplemente OUT_OF_SERVICE o BLOCKED.
// ─────────────────────────────────────────────────────────────

// Schema base: z.object() puro, sin refinements.
const RestaurantTableBaseSchema = z.object({
  capacity: z
    .number()
    .int()
    .min(1, 'La capacidad mínima es 1 persona')
    .max(50, 'La capacidad máxima es 50 personas'),
});

// Create: agrega tableNumber (inmutable) y omite tableStatus.
// Toda mesa nueva nace con tableStatus = ACTIVE (default en DB).
// INMUTABLE: tableNumber tiene unique constraint (branchId, tableNumber).
// Para cambiar el número de una mesa, eliminar y crear una nueva.
export const CreateRestaurantTableSchema = RestaurantTableBaseSchema.extend({
  tableNumber: z
    .string()
    .trim()
    .min(1, 'El número de mesa no puede estar vacío')
    .max(10, 'El número de mesa no puede superar 10 caracteres')
    .regex(
      /^[a-zA-Z0-9\-]+$/,
      'El número de mesa solo puede contener letras, números y guiones',
    ),
});

// Update: solo capacity y tableStatus son modificables.
// tableNumber es inmutable (no se incluye).
export const UpdateRestaurantTableSchema = z.object({
  capacity: z
    .number()
    .int()
    .min(1, 'La capacidad mínima es 1 persona')
    .max(50, 'La capacidad máxima es 50 personas')
    .optional(),

  tableStatus: z.nativeEnum(TableStatus).optional(),
});

export type CreateRestaurantTableDto = z.infer<typeof CreateRestaurantTableSchema>;
export type UpdateRestaurantTableDto = z.infer<typeof UpdateRestaurantTableSchema>;

// ─────────────────────────────────────────────────────────────
// TableBlock (bloqueo temporal de una mesa)
//
// Permite marcar una mesa como no disponible para un intervalo específico
// sin cambiar su tableStatus persistente. Casos de uso:
//   - Mantenimiento puntual
//   - Mesa reservada para un evento privado
//   - Problemas físicos temporales
//   - Bloqueo de un sector completo
//
// El motor de disponibilidad consulta TableBlock junto con las reservas
// activas para determinar si una mesa puede ser asignada.
// ─────────────────────────────────────────────────────────────

export const CreateTableBlockSchema = z
  .object({
    // ISO 8601 con timezone (ej: "2026-09-10T20:00:00-03:00")
    // El backend convierte a UTC para almacenamiento.
    startAt: z.string().datetime({
      offset: true,
      message: 'startAt debe ser un datetime ISO 8601 con timezone',
    }),
    endAt: z.string().datetime({
      offset: true,
      message: 'endAt debe ser un datetime ISO 8601 con timezone',
    }),
    reason: z
      .string()
      .trim()
      .min(3, 'El motivo debe tener al menos 3 caracteres')
      .max(500, 'El motivo no puede superar 500 caracteres'),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: 'endAt debe ser posterior a startAt',
    path: ['endAt'],
  });

export type CreateTableBlockDto = z.infer<typeof CreateTableBlockSchema>;
