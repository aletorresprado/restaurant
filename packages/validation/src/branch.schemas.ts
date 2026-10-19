import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Branch
// ─────────────────────────────────────────────────────────────

// Schema base: z.object() puro, sin refinements.
const BranchBaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede superar 100 caracteres'),

  address: z
    .string()
    .trim()
    .min(5, 'La dirección debe tener al menos 5 caracteres')
    .max(255, 'La dirección no puede superar 255 caracteres'),

  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s\-().]{7,20}$/, 'El teléfono debe tener un formato válido')
    .optional(),

  // Coordenadas geográficas opcionales para mostrar la sucursal en un mapa
  latitude: z
    .number()
    .min(-90, 'La latitud debe estar entre -90 y 90')
    .max(90, 'La latitud debe estar entre -90 y 90')
    .optional(),

  longitude: z
    .number()
    .min(-180, 'La longitud debe estar entre -180 y 180')
    .max(180, 'La longitud debe estar entre -180 y 180')
    .optional(),

  isActive: z.boolean().default(true),
});

// Create: se exige que latitude y longitude vengan juntos o ninguno.
// No tiene sentido registrar una sucursal con coordenadas incompletas.
export const CreateBranchSchema = BranchBaseSchema.refine(
  (data) => {
    const hasLat = data.latitude !== undefined;
    const hasLng = data.longitude !== undefined;
    return hasLat === hasLng;
  },
  {
    message: 'latitude y longitude deben proporcionarse juntos o ninguno',
    path: ['longitude'],
  },
);

// Update: todos los campos opcionales, sin refinements.
// Se permite actualizar latitude o longitude individualmente (ej: corregir
// solo un valor sin necesidad de enviar el par completo).
export const UpdateBranchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede superar 100 caracteres')
    .optional(),

  address: z
    .string()
    .trim()
    .min(5, 'La dirección debe tener al menos 5 caracteres')
    .max(255, 'La dirección no puede superar 255 caracteres')
    .optional(),

  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s\-().]{7,20}$/, 'El teléfono debe tener un formato válido')
    .optional(),

  latitude: z
    .number()
    .min(-90, 'La latitud debe estar entre -90 y 90')
    .max(90, 'La latitud debe estar entre -90 y 90')
    .optional(),

  longitude: z
    .number()
    .min(-180, 'La longitud debe estar entre -180 y 180')
    .max(180, 'La longitud debe estar entre -180 y 180')
    .optional(),

  isActive: z.boolean().optional(),
});

export type CreateBranchDto = z.infer<typeof CreateBranchSchema>;
export type UpdateBranchDto = z.infer<typeof UpdateBranchSchema>;
