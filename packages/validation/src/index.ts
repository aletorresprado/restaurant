// Schemas de validación — package @repo/validation
// Cada módulo exporta schemas Zod y sus tipos derivados (z.infer).
// Los schemas se usan tanto en backend (NestJS pipes) como en
// frontend (React Hook Form + resolvers).

export * from './auth.schemas';
export * from './branch.schemas';
export * from './schedule.schemas';
export * from './table.schemas';
export * from './user.schemas';

// Los siguientes schemas se agregarán en fases posteriores:
// export * from './reservation.schemas';  // Fase 2
// export * from './survey.schemas';       // Fase 5
