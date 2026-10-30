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
let refreshing: Promise<void> | null = null;
let loggingOut = false;
let generation = 0;
const subscribers = new Set<() => void>();
export const onSessionChange = (fn: () => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};
export const getSession = () => session;
export function setSession(value: Session | null) {
  session = value;
  generation++;
  try {
    value ? sessionStorage.setItem(key, JSON.stringify(value)) : sessionStorage.removeItem(key);
  } catch {
    /* Session can remain in memory when storage is unavailable. */
  }
  subscribers.forEach((fn) => fn());
}
export function restoreSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      value &&
      typeof value.accessToken === 'string' &&
      typeof value.refreshToken === 'string' &&
      value.user?.id
    )
      session = value;
  } catch {
    session = null;
  }
}
const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
async function raw<T>(path: string, options: RequestInit, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: options.signal ?? AbortSignal.timeout(15000),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'No pudimos conectar con el servidor. Revisá tu conexión.');
  }
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
): Promise<T> {
  const oldToken = session?.accessToken;
  const userId = session?.user.id;
  const version = generation;
  if (authenticated && (!session || loggingOut)) throw new ApiError(401, 'Ingresá para continuar.');
  try {
    return await raw<T>(path, options, authenticated ? oldToken : undefined);
  } catch (error) {
    if (
      !authenticated ||
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      !session ||
      loggingOut
    )
      throw error;
    // An earlier request may already have rotated the token while this one was in flight.
    if (session.accessToken === oldToken && version === generation) {
      if (!refreshing) {
        const refreshVersion = generation;
        refreshing = raw<Session>('/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        })
          .then((value) => {
            if (generation === refreshVersion) setSession(value);
          })
          .catch((error) => {
            if (generation === refreshVersion && error instanceof ApiError && error.status === 401)
              setSession(null);
            throw error;
          })
          .finally(() => {
            refreshing = null;
          });
      }
      await refreshing;
    }
    if (!session || session.user.id !== userId)
      throw new ApiError(401, 'La sesión cambió. Ingresá nuevamente.');
    return raw<T>(path, options, session.accessToken);
  }
}
export const post = <T>(path: string, body: unknown, authenticated = false) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) }, authenticated);
export async function logoutSession() {
  loggingOut = true;
  try {
    if (refreshing) await refreshing;
    if (session)
      await raw('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    setSession(null);
  } finally {
    loggingOut = false;
  }
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'No se pudo completar la operación.';
