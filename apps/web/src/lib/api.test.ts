import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  establishSession,
  getSession,
  getSessionTabId,
  logoutSession,
  setSession,
} from './api';
const user = {
  id: 'customer-1',
  firstName: 'Ana',
  lastName: 'Perez',
  email: 'ana@example.invalid',
  phone: null,
  role: 'CUSTOMER' as const,
};
const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
describe('cookie authenticated API client', () => {
  beforeEach(async () => {
    await establishSession({ user });
  });
  afterEach(() => {
    setSession(null);
    vi.unstubAllGlobals();
  });
  it('sends only a public tab identifier and same-origin cookies', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, { success: true }));
    vi.stubGlobal('fetch', fetcher);
    await api('/one', {}, true);
    const options = fetcher.mock.calls[0][1] as RequestInit;
    expect(options.headers).toMatchObject({ 'X-Web-Session': getSessionTabId() });
    expect(new Headers(options.headers).has('Authorization')).toBe(false);
    expect(options.credentials).toBe('same-origin');
    expect(options.cache).toBe('no-store');
  });
  it('ends an expired cookie session without rotating tokens or replaying a request', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(401, {}));
    vi.stubGlobal('fetch', fetcher);
    await expect(api('/one', {}, true)).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getSession()).toBeNull();
  });
  it('does not repeat a reservation POST after a network error', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('connection lost'));
    vi.stubGlobal('fetch', fetcher);
    await expect(api('/reservations', { method: 'POST', body: '{}' }, true)).rejects.toMatchObject({
      status: 0,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not repeat conflicts or business-rule rejections', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(409, { message: 'Sin mesas' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(api('/reservations', { method: 'POST', body: '{}' }, true)).rejects.toMatchObject({
      status: 409,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('preserves the local session if revocation cannot reach the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(logoutSession()).rejects.toMatchObject({ status: 0 });
    expect(getSession()?.user.id).toBe(user.id);
  });
  it('lets the browser provide the multipart boundary', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, {}));
    vi.stubGlobal('fetch', fetcher);
    const body = new FormData();
    body.append('file', new Blob(['bytes'], { type: 'image/jpeg' }), 'photo.jpg');
    await api('/admin/branches/id/image', { method: 'POST', body }, true);
    const options = fetcher.mock.calls[0][1] as RequestInit;
    expect(options.body).toBe(body);
    expect(new Headers(options.headers).has('Content-Type')).toBe(false);
  });
  it('decodes authenticated binary responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Blob(['photo'], { type: 'image/png' }))),
    );
    const blob = await api<Blob>('/admin/branches/id/image', {}, true, 'blob');
    expect(blob.type).toBe('image/png');
    expect(await blob.text()).toBe('photo');
  });
  it('rejects an old successful read after changing accounts', async () => {
    let complete!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      ),
    );
    const pending = api('/auth/me', {}, true);
    setSession({ user: { ...user, id: 'another-user' } });
    complete(response(200, user));
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(getSession()?.user.id).toBe('another-user');
  });
  it('treats a successful write as uncertain after switching sessions', async () => {
    let complete!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      ),
    );
    const pending = api('/reservations', { method: 'POST', body: '{}' }, true);
    setSession(null);
    complete(response(200, { id: 'created' }));
    await expect(pending).rejects.toMatchObject({ status: 0 });
  });
  it('does not clear a new login when an old unauthorized response arrives', async () => {
    let complete!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      ),
    );
    const pending = api('/one', {}, true);
    setSession({ user });
    complete(response(401, {}));
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(getSession()?.user.id).toBe(user.id);
  });
  it('does not clear a new login when a previous logout finishes', async () => {
    let complete!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      ),
    );
    const pending = logoutSession();
    setSession({ user: { ...user, id: 'new-login' } });
    complete(response(200, { success: true }));
    await pending;
    expect(getSession()?.user.id).toBe('new-login');
  });
});
