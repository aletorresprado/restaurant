import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import type { Selection } from './store';

const schema = z.object({
  operationId: z.string().uuid(),
  selection: z.object({
    branchId: z.string().uuid(),
    serviceDate: z.string().date(),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    partySize: z.number().int().min(1).max(50),
    operationId: z.string().uuid().optional(),
  }),
  reservationId: z.string().uuid().optional(),
});
export type ReservationIntent = z.infer<typeof schema>;
const key = (userId: string) => `app-resto-reservation-intent:${userId}`;
const event = 'app-resto-reservation-intent-change';
const unreadable = '__unreadable__';
const storageError =
  'No pudimos guardar o leer el intento de reserva. Habilitá el almacenamiento de este sitio antes de confirmar.';
function read(userId: string) {
  try {
    return localStorage.getItem(key(userId));
  } catch {
    throw new Error(storageError);
  }
}
function parse(raw: string | null): ReservationIntent | null {
  if (raw === null) return null;
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    throw new Error(storageError);
  }
}
function write(userId: string, intent: ReservationIntent | null) {
  const value = intent ? JSON.stringify(intent) : null;
  try {
    if (value) localStorage.setItem(key(userId), value);
    else localStorage.removeItem(key(userId));
  } catch {
    throw new Error(storageError);
  }
  if (read(userId) !== value) throw new Error(storageError);
  window.dispatchEvent(new Event(event));
}
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(event, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(event, callback);
  };
}
export function useReservationIntent(userId?: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return userId ? read(userId) : null;
      } catch {
        return unreadable;
      }
    },
    () => null,
  );
  return useMemo(() => {
    try {
      return { intent: parse(raw), error: '' };
    } catch {
      return { intent: null, error: storageError };
    }
  }, [raw]);
}
export function sameSelection(a: Selection, b: Selection) {
  return (
    a.branchId === b.branchId &&
    a.serviceDate === b.serviceDate &&
    a.partySize === b.partySize &&
    new Date(a.startAt).getTime() === new Date(b.startAt).getTime()
  );
}
async function locked<T>(userId: string, action: () => T): Promise<T> {
  if (!navigator.locks)
    throw new Error(
      'Este navegador no permite coordinar reservas entre pestañas. Usá un navegador actualizado en HTTPS o localhost.',
    );
  return navigator.locks.request(`app-resto-booking:${userId}`, action);
}
export async function prepareReservation(
  userId: string,
  selection: Selection,
): Promise<ReservationIntent> {
  return locked(userId, () => {
    const existing = parse(read(userId));
    if (
      existing &&
      (!existing.reservationId ||
        existing.operationId === selection.operationId ||
        sameSelection(existing.selection, selection))
    ) {
      if (!sameSelection(existing.selection, selection))
        throw new Error(
          'Hay otra confirmación pendiente. Retomala antes de elegir una reserva diferente.',
        );
      return existing;
    }
    const operationId = selection.operationId ?? crypto.randomUUID();
    const intent = { operationId, selection: { ...selection, operationId } };
    write(userId, intent); // Persist before the first POST; fail closed if storage is unavailable.
    return intent;
  });
}
export async function finishReservation(
  userId: string,
  operationId: string,
  reservationId?: string,
) {
  return locked(userId, () => {
    const existing = parse(read(userId));
    if (existing?.operationId === operationId) write(userId, null); // Success/rejection no longer needs private details on this device.
  });
}
export async function clearResolvedReservation(userId: string) {
  try {
    await locked(userId, () => {
      const existing = parse(read(userId));
      if (existing?.reservationId) write(userId, null);
    });
  } catch {
    /* Cleanup must not prevent login or discard unresolved operations. */
  }
}
