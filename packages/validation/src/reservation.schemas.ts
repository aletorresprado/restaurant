import { z } from 'zod';
import { AttendanceOutcome } from '@repo/shared-types';

export const AvailabilityQuerySchema = z.object({
  date: z.string().date(),
  partySize: z.coerce.number().int().min(1).max(50),
}).strict();
export const CreateReservationSchema = z.object({
  branchId: z.string().uuid(),
  serviceDate: z.string().date(),
  startAt: z.string().datetime({ offset: true }),
  partySize: z.number().int().min(1).max(50),
}).strict();
export const CancelReservationSchema = z.object({ reason: z.string().trim().min(3).max(500).optional() }).strict();
export const RecordAttendanceSchema = z.object({
  outcome: z.nativeEnum(AttendanceOutcome),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict();
export type RecordAttendanceDto = z.infer<typeof RecordAttendanceSchema>;
export type CreateReservationDto = z.infer<typeof CreateReservationSchema>;
export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;
