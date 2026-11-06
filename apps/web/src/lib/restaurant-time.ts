import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { BUSINESS_CONFIG } from '@repo/config';
import { z } from 'zod';

// datetime-local values are civil restaurant times, never browser-local dates.
export function restaurantInstant(value: string, timezone: string = BUSINESS_CONFIG.timezone) {
  const [day, time] = value.split('T');
  if (
    !z.string().date().safeParse(day).success ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? '') ||
    value !== `${day}T${time}`
  )
    throw new Error('Ingresá una fecha y hora válidas.');
  const instant = fromZonedTime(`${value}:00`, timezone);
  if (
    !Number.isFinite(instant.getTime()) ||
    formatInTimeZone(instant, timezone, "yyyy-MM-dd'T'HH:mm") !== value
  )
    throw new Error('La hora elegida no existe en la zona del restaurante.');
  return instant.toISOString();
}
