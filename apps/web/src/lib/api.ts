import { claimSession } from './session-ownership';

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
};
export type Session = { user: User; accessToken: string; refreshToken: string };
export type Branch = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  isActive: boolean;
  latitude?: number | null;
  longitude?: number | null;
  imageVersion?: string | null;
};
export type Page<T> = {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};
export type Slot = { startAt: string; endAt: string; availableTables: number };
export type Reservation = {
  id: string;
  branchId: string;
  serviceDate: string;
  startAt: string;
  endAt: string;
  partySize: number;
  status:
    'CONFIRMED' | 'CANCELLED_BY_CUSTOMER' | 'CANCELLED_BY_RESTAURANT' | 'ATTENDED' | 'NO_SHOW';
  branch: { name: string; address: string };
  table: { tableNumber: string };
  events: { id: string; type: string; createdAt: string; reason: string | null }[];
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const key = 'app-resto-session-v1';
let session: Session | null = null;
let refreshing: { identity: number; promise: Promise<void> } | null = null;
let loggingOut = false;
let generation = 0;
let identity = 0;
let ownerId: string | null = null;
let releaseOwnership: (() => void) | null = null;
const subscribers = new Set<() => void>();
export const onSessionChange = (fn: () => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};
export const getSession = () => session;
export const getSessionIdentity = () => identity;
export function setSession(value: Session | null, rotation = false) {
  if (!rotation && (!value || value.refreshToken !== session?.refreshToken)) identity++;
  session = value;
  generation++;
  if (!value) {
    releaseOwnership?.();
    releaseOwnership = null;
    ownerId = null;
  }
  try {
    value && ownerId
      ? sessionStorage.setItem(key, JSON.stringify({ ...value, ownerId }))
      : sessionStorage.removeItem(key);
  } catch {
    /* Session can remain in memory when storage is unavailable. */
  }
  subscribers.forEach((fn) => fn());
}
export async function establishSession(value: Session) {
  const id = crypto.randomUUID();
  const release = await claimSession(id);
  releaseOwnership?.();
  releaseOwnership = release ?? null;
  ownerId = release ? id : null;
  setSession(value);
}
export async function restoreSession(): Promise<string | null> {
  const version = generation;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      value &&
      typeof value.accessToken === 'string' &&
      typeof value.refreshToken === 'string' &&
      typeof value.user?.id === 'string' &&
      typeof value.user?.email === 'string' &&
      typeof value.user?.firstName === 'string' &&
      typeof value.user?.lastName === 'string' &&
      ['CUSTOMER', 'STAFF', 'ADMIN'].includes(value.user?.role)
    ) {
      // Legacy sessions have no owner ID. Their token fingerprint also detects copies.
      const id =
        typeof value.ownerId === 'string'
          ? value.ownerId
          : Array.from(
              new Uint8Array(
                await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.refreshToken)),
              ),
            )
              .map((byte) => byte.toString(16).padStart(2, '0'))
              .join('');
      const release = await claimSession(id);
      if (generation !== version) {
        release?.();
        return null;
      }
      if (!release) {
        setSession(null);
        return release === null
          ? 'Esta sesión está en uso en otra pestaña. Ingresá nuevamente en esta pestaña.'
          : 'Ingresá nuevamente. Este navegador no permite restaurar la sesión de forma segura.';
      }
      releaseOwnership?.();
      releaseOwnership = release;
      ownerId = id;
      // Keep the cached profile private until StoreProvider verifies /auth/me.
      // Login remains available while that verification is pending or offline.
      session = value;
      identity++;
      generation++;
    } else if (generation === version) setSession(null);
  } catch {
    if (generation === version) setSession(null);
  }
  return null;
}
const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
export const apiUrl = (path: string) => `${base}${path}`;
async function raw<T>(
  path: string,
  options: RequestInit,
  token?: string,
  responseType: 'json' | 'blob' = 'json',
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: options.signal ?? AbortSignal.timeout(15000),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'No pudimos conectar con el servidor. Revisá tu conexión.');
  }
  if (response.ok && responseType === 'blob') return (await response.blob()) as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join('. ')
          : 'No se pudo completar la operación.';
    throw new ApiError(response.status, message);
  }
  return body as T;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  authenticated = false,
  responseType: 'json' | 'blob' = 'json',
): Promise<T> {
  const oldToken = session?.accessToken;
  const userId = session?.user.id;
  const version = generation;
  const requestIdentity = identity;
  if (authenticated && (!session || loggingOut)) throw new ApiError(401, 'Ingresá para continuar.');
  try {
    const result = await raw<T>(path, options, authenticated ? oldToken : undefined, responseType);
    if (authenticated && identity !== requestIdentity)
      throw new ApiError(
        !options.method || options.method === 'GET' ? 401 : 0,
        'La sesión cambió. Volvé a consultar el estado de la operación.',
      );
    return result;
  } catch (error) {
    if (
      !authenticated ||
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      !session ||
      loggingOut ||
      identity !== requestIdentity
    )
      throw error;
    // An earlier request may already have rotated the token while this one was in flight.
    if (session.accessToken === oldToken && version === generation) {
      if (!refreshing || refreshing.identity !== requestIdentity) {
        const refreshVersion = generation;
        const current = { identity: requestIdentity, promise: Promise.resolve() };
        current.promise = raw<Session>('/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        })
          .then((value) => {
            if (generation === refreshVersion) setSession(value, true);
          })
          .catch((error) => {
            if (generation === refreshVersion && error instanceof ApiError && error.status === 401)
              setSession(null);
            throw error;
          })
          .finally(() => {
            if (refreshing === current) refreshing = null;
          });
        refreshing = current;
      }
      await refreshing.promise;
    }
    if (!session || session.user.id !== userId || identity !== requestIdentity)
      throw new ApiError(401, 'La sesión cambió. Ingresá nuevamente.');
    const result = await raw<T>(path, options, session.accessToken, responseType);
    if (identity !== requestIdentity)
      throw new ApiError(
        !options.method || options.method === 'GET' ? 401 : 0,
        'La sesión cambió. Volvé a consultar el estado de la operación.',
      );
    return result;
  }
}
export const post = <T>(path: string, body: unknown, authenticated = false) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) }, authenticated);
export async function logoutSession() {
  loggingOut = true;
  const logoutIdentity = identity;
  try {
    if (refreshing?.identity === logoutIdentity) await refreshing.promise;
    if (session && identity === logoutIdentity)
      await raw('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    if (identity === logoutIdentity) setSession(null);
  } finally {
    loggingOut = false;
  }
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'No se pudo completar la operación.';
