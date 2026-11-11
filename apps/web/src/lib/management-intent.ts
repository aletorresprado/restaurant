import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { api, ApiError, getSession, getSessionIdentity } from './api';

const uuid = '[0-9a-f-]{36}';
const pathSchema = z
  .string()
  .regex(
    new RegExp(
      `^(?:/admin/branches|/admin/users/${uuid}/loyalty/adjustments|/staff/branches/${uuid}/(?:tables(?:/${uuid}/blocks)?|schedules|schedule-exceptions))$`,
      'i',
    ),
  );
const schema = z.object({
  operationId: z.string().uuid(),
  path: pathSchema,
  body: z.record(z.union([z.string(), z.number().finite(), z.boolean(), z.null()])),
  attempted: z.boolean(),
});
export type ManagementIntent = z.infer<typeof schema>;
const prefix = 'app-resto-management:';
const event = 'app-resto-management-change';
const unavailable = '__storage_unavailable__';
const storageError =
  'No pudimos guardar o leer la operación. Revisá el almacenamiento de este sitio antes de enviar.';
const key = (actorId: string, path: string) => `${prefix}${actorId}:${path}`;
function read(actorId: string, path: string) {
  const raw = localStorage.getItem(key(actorId, path));
  if (!raw) return null;
  const value = schema.parse(JSON.parse(raw));
  if (value.path !== path) throw new Error(storageError);
  return value;
}
function write(actorId: string, path: string, value: ManagementIntent | null) {
  try {
    const raw = value ? JSON.stringify(value) : null;
    if (raw) localStorage.setItem(key(actorId, path), raw);
    else localStorage.removeItem(key(actorId, path));
    if (localStorage.getItem(key(actorId, path)) !== raw) throw new Error(storageError);
    window.dispatchEvent(new Event(event));
  } catch {
    throw new Error(storageError);
  }
}
function subscribe(fn: () => void) {
  window.addEventListener('storage', fn);
  window.addEventListener(event, fn);
  return () => {
    window.removeEventListener('storage', fn);
    window.removeEventListener(event, fn);
  };
}
export function useManagementIntents(actorId?: string) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      if (!actorId) return '[]';
      try {
        const keys = Object.keys(localStorage)
          .filter((k) => k.startsWith(`${prefix}${actorId}:`))
          .sort();
        return JSON.stringify(keys.map((k) => [k, localStorage.getItem(k)]));
      } catch {
        return unavailable;
      }
    },
    () => '[]',
  );
  return useMemo(() => {
    try {
      const records = (JSON.parse(snapshot) as [string, string][]).map(([k, raw]) => {
        const value = schema.parse(JSON.parse(raw));
        if (k !== key(actorId!, value.path)) throw new Error(storageError);
        return value;
      });
      return { records, error: '' };
    } catch {
      return { records: [] as ManagementIntent[], error: storageError };
    }
  }, [actorId, snapshot]);
}
async function locked<T>(actorId: string, path: string, action: () => T) {
  if (!navigator.locks)
    throw new Error(
      'Usá un navegador con coordinación entre pestañas en HTTPS o localhost para guardar esta operación.',
    );
  return navigator.locks.request(key(actorId, path), action);
}
const signature = (body: Record<string, unknown>) =>
  JSON.stringify(
    Object.entries(body)
      .filter(([key]) => key !== 'operationId')
      .sort(([a], [b]) => a.localeCompare(b)),
  );
export async function prepareManagement(
  actorId: string,
  path: string,
  body: Record<string, unknown>,
  attempted = true,
) {
  pathSchema.parse(path);
  return locked(actorId, path, () => {
    let existing: ManagementIntent | null;
    try {
      existing = read(actorId, path);
    } catch {
      throw new Error(storageError);
    }
    if (existing) {
      if (signature(existing.body) !== signature(body))
        throw new Error(
          'Hay otra operación pendiente en este formulario. Recuperala antes de ingresar datos diferentes.',
        );
      if (attempted && !existing.attempted) {
        existing = { ...existing, attempted: true };
        write(actorId, path, existing);
      }
      return existing;
    }
    const operationId =
      typeof body.operationId === 'string'
        ? z.string().uuid().parse(body.operationId)
        : crypto.randomUUID();
    const value = schema.parse({
      path,
      operationId,
      body: { ...body, ...(body.operationId ? { operationId } : {}) },
      attempted,
    });
    write(actorId, path, value);
    return value;
  });
}
export async function clearManagement(
  actorId: string,
  record: ManagementIntent,
  draftOnly = false,
) {
  await locked(actorId, record.path, () => {
    const existing = read(actorId, record.path);
    if (existing?.operationId === record.operationId && (!draftOnly || !existing.attempted))
      write(actorId, record.path, null);
  });
}
export async function managedPost<T>(
  path: string,
  body: Record<string, unknown>,
  expectedActor?: string,
): Promise<T> {
  const actorId = getSession()?.user.id;
  const identity = getSessionIdentity();
  if (!actorId) throw new ApiError(401, 'Ingresá para continuar.');
  if (expectedActor && actorId !== expectedActor)
    throw new ApiError(401, 'Ingresá con la cuenta que inició la operación.');
  const record = await prepareManagement(actorId, path, body);
  if (identity !== getSessionIdentity())
    throw new ApiError(401, 'La sesión cambió. Retomá con la cuenta original.');
  try {
    const result = await api<T>(
      path,
      {
        method: 'POST',
        body: JSON.stringify(record.body),
        headers: { 'Idempotency-Key': record.operationId },
      },
      true,
    );
    await clearManagement(actorId, record);
    if (identity !== getSessionIdentity())
      throw new ApiError(0, 'La sesión cambió. Revisá el resultado con la cuenta original.');
    return result;
  } catch (error) {
    if (
      error instanceof ApiError &&
      [400, 404, 409, 410].includes(error.status) &&
      error.code !== 'OPERATION_MISMATCH'
    )
      await clearManagement(actorId, record).catch(() => {});
    throw error;
  }
}
