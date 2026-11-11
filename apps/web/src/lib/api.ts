import { claimSession } from './session-ownership';

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
};
export type Session = { user: User };
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
    public code?: string,
  ) {
    super(message);
  }
}

const key = 'app-resto-web-tab-v1';
let session: Session | null = null;
let tabId: string | null = null;
let loggingOut = false;
let identity = 0;
let releaseOwnership: (() => void) | null = null;
const subscribers = new Set<() => void>();
export const onSessionChange = (fn: () => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};
export const getSession = () => session;
export const getSessionTabId = () => tabId;
export const getSessionIdentity = () => identity;
export function setSession(value: Session | null, profileUpdate = false) {
  if (!profileUpdate) identity++;
  session = value;
  if (!value) {
    tabId = null;
    releaseOwnership?.();
    releaseOwnership = null;
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* Memory-only tab. */
    }
  }
  subscribers.forEach((fn) => fn());
}
export async function establishSession(value: Session, id = crypto.randomUUID()) {
  const release = await claimSession(id);
  releaseOwnership?.();
  releaseOwnership = release ?? null;
  tabId = id;
  try {
    if (release) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
    sessionStorage.removeItem('app-resto-session-v1');
  } catch {
    /* No credentials are ever persisted by JavaScript. */
  }
  setSession(value);
}
export async function restoreSession(): Promise<string | null> {
  const version = identity;
  try {
    // Previous JWT sessions require a new login; never migrate their secrets.
    sessionStorage.removeItem('app-resto-session-v1');
    const id = sessionStorage.getItem(key);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const release = await claimSession(id);
    if (identity !== version) {
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
    tabId = id;
    identity++;
  } catch {
    if (identity === version) setSession(null);
  }
  return null;
}
const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
export const apiUrl = (path: string) => `${base}${path}`;
async function raw<T>(
  path: string,
  options: RequestInit,
  currentTab?: string,
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
        ...(currentTab ? { 'X-Web-Session': currentTab } : {}),
      },
      credentials: 'same-origin',
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
    throw new ApiError(response.status, message, body?.code);
  }
  return body as T;
}
export async function signInSession(mode: 'login' | 'register', body: unknown) {
  if (new URL(base, window.location.href).origin !== window.location.origin)
    throw new ApiError(0, 'La web y la API deben compartir origen para ingresar de forma segura.');
  const id = crypto.randomUUID();
  const previousTab = tabId; // Only an owned tab, never a copied storage hint.
  const value = await raw<Session>(
    `/auth/web/${mode}`,
    { method: 'POST', body: JSON.stringify(body) },
    id,
  );
  if (previousTab)
    await raw('/auth/web/logout', { method: 'POST', body: '{}' }, previousTab);
  await establishSession(value, id);
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  authenticated = false,
  responseType: 'json' | 'blob' = 'json',
): Promise<T> {
  const version = identity;
  const currentTab = tabId;
  if (authenticated && (!currentTab || loggingOut))
    throw new ApiError(401, 'Ingresá para continuar.');
  try {
    const result = await raw<T>(
      path,
      options,
      authenticated ? currentTab! : undefined,
      responseType,
    );
    if (authenticated && identity !== version)
      throw new ApiError(
        !options.method || options.method === 'GET' ? 401 : 0,
        'La sesión cambió. Volvé a consultar el estado de la operación.',
      );
    return result;
  } catch (error) {
    if (authenticated && identity === version && error instanceof ApiError && error.status === 401)
      setSession(null);
    throw error;
  }
}
export const post = <T>(path: string, body: unknown, authenticated = false) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) }, authenticated);
export async function logoutSession() {
  loggingOut = true;
  const version = identity;
  const currentTab = tabId;
  try {
    if (currentTab) await raw('/auth/web/logout', { method: 'POST', body: '{}' }, currentTab);
    if (identity === version) setSession(null);
  } finally {
    loggingOut = false;
  }
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'No se pudo completar la operación.';
