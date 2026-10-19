import { LoyaltyTier } from '@repo/shared-types';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE NEGOCIO CENTRALIZADA
//
// Todos los valores de dominio que afectan reglas de negocio están aquí.
// Preparado para migrar a configuración dinámica (DB/env) sin tocar el resto
// del sistema.
// ─────────────────────────────────────────────────────────────────────────────

export const BUSINESS_CONFIG = {
  // Zona horaria del restaurante. Usada en backend para construir y comparar
  // timestamps. Nunca depender del TZ del dispositivo móvil.
  timezone: 'America/Argentina/Tucuman',

  reservation: {
    // Duración por defecto de una reserva en minutos.
    // Preparado para ser configurable por sucursal/franja/partySize en el futuro.
    defaultDurationMinutes: 120,
  },

  cancellation: {
    // Horas mínimas de anticipación para que un cliente pueda cancelar sin penalización.
    customerLimitHours: 6,
  },

  attendance: {
    // Minutos desde startAt antes de los cuales no se puede marcar NO_SHOW.
    // Valor razonado: 30 min es tiempo suficiente para que un cliente tarde llegue.
    noShowGracePeriodMinutes: 30,
  },

  loyalty: {
    attendanceReward: 1,   // +1 estrella por asistir
    surveyReward: 2,        // +2 estrellas por completar encuesta
    noShowPenalty: 3,       // -3 estrellas por no presentarse (se aplica como negativo)
    minimumBalance: 0,      // El saldo nunca puede bajar de este valor
  },

  auth: {
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
    bcryptRounds: 12,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// NIVELES DE FIDELIZACIÓN
//
// Ordenados de mayor a menor para que calculateLoyaltyTier retorne el nivel
// correcto en el primer match.
// ─────────────────────────────────────────────────────────────────────────────

export const LOYALTY_TIER_THRESHOLDS: ReadonlyArray<{
  tier: LoyaltyTier;
  min: number;
}> = [
  { tier: LoyaltyTier.PLATINUM, min: 31 },
  { tier: LoyaltyTier.GOLD, min: 15 },
  { tier: LoyaltyTier.SILVER, min: 10 },
  { tier: LoyaltyTier.BRONZE, min: 5 },
  { tier: LoyaltyTier.WHITE, min: 0 },
];

/**
 * Calcula el nivel de fidelización a partir del saldo de puntos.
 *
 * Esta es la ÚNICA fuente de verdad para la lógica de tiers.
 * No duplicar esta lógica en ninguna otra parte del sistema.
 *
 * @param points - Saldo efectivo (ya con floor en 0 aplicado)
 * @returns El tier correspondiente
 */
export function calculateLoyaltyTier(points: number): LoyaltyTier {
  for (const { tier, min } of LOYALTY_TIER_THRESHOLDS) {
    if (points >= min) return tier;
  }
  return LoyaltyTier.WHITE;
}
