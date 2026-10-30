import { BUSINESS_CONFIG } from '@repo/config';
const zone = BUSINESS_CONFIG.timezone;
export const hhmm = (value: string | Date) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
export const longDay = (value: string | Date) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(value));
export const formatDateTime = (value: string | Date) => `${longDay(value)}, ${hhmm(value)} h`;
export function restaurantDate(value: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join('-');
}
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00Z`));
export const cancelDeadline = (startAt: string) =>
  new Date(Date.parse(startAt) - BUSINESS_CONFIG.cancellation.customerLimitHours * 3600000);
export const canCancel = (startAt: string) => Date.now() <= cancelDeadline(startAt).getTime();
export const eventLabel = (type: string) =>
  ({
    RESERVATION_CREATED: 'Reserva creada',
    RESERVATION_CONFIRMED: 'Reserva confirmada',
    CUSTOMER_CANCELLED: 'Cancelada por vos',
    RESTAURANT_CANCELLED: 'Cancelada por el restaurante',
    ATTENDANCE_CONFIRMED: 'Asistencia registrada',
    NO_SHOW_RECORDED: 'Ausencia registrada',
    STATUS_CHANGED: 'Estado actualizado',
  })[type] ?? 'Evento de reserva';
