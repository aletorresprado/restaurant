import { BadRequestException } from '@nestjs/common';
import { BUSINESS_CONFIG } from '@repo/config';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const timezone = BUSINESS_CONFIG.timezone;
export const nextDate = (date: string, days = 1) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const isoDay = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
export const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export type Hours = { openingTime: string; closingTime: string; reservationIntervalMinutes?: number };
export function windowFor(date: string, hours: Hours) {
  const endDate = hours.closingTime < hours.openingTime ? nextDate(date) : date;
  const instant = (day: string, time: string) => {
    const local = `${day}T${time}:00`;
    const result = fromZonedTime(local, timezone);
    if (formatInTimeZone(result, timezone, "yyyy-MM-dd'T'HH:mm:ss") !== local) throw new BadRequestException('Hora local inexistente en la zona del restaurante');
    return result;
  };
  return { startAt: instant(date, hours.openingTime), endAt: instant(endDate, hours.closingTime) };
}
export function weeklyOverlap(rows: (Hours & { dayOfWeek: number; isActive: boolean })[]) {
  const intervals = rows.filter(r => r.isActive).map(r => {
    const start = (r.dayOfWeek - 1) * 1440 + minutes(r.openingTime);
    return { start, end: start + ((minutes(r.closingTime) - minutes(r.openingTime) + 1440) % 1440) };
  });
  return intervals.some((a, i) => intervals.some((b, j) => i !== j && [-10080, 0, 10080].some(shift => a.start < b.end + shift && a.end > b.start + shift)));
}
