import { BUSINESS_CONFIG } from '@repo/config';

export const durationMs = BUSINESS_CONFIG.reservation.defaultDurationMinutes * 60000;
export const fits = (start: Date, end: Date, window: { startAt: Date; endAt: Date } | null) => !!window && start >= window.startAt && end <= window.endAt;
export const aligned = (start: Date, windowStart: Date, interval: number) => (start.getTime() - windowStart.getTime()) % (interval * 60000) === 0;
export const canCustomerCancel = (start: Date, now: Date) => start.getTime() - now.getTime() >= BUSINESS_CONFIG.cancellation.customerLimitHours * 3600000;
export const overlaps = (a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }) => a.startAt < b.endAt && a.endAt > b.startAt;
