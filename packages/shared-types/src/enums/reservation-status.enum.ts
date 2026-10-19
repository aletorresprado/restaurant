export enum ReservationStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED_BY_CUSTOMER = 'CANCELLED_BY_CUSTOMER',
  CANCELLED_BY_RESTAURANT = 'CANCELLED_BY_RESTAURANT',
  ATTENDED = 'ATTENDED',
  NO_SHOW = 'NO_SHOW',
  // PENDING eliminado: la reserva nace directamente CONFIRMED
  // si el backend valida disponibilidad correctamente.
}
