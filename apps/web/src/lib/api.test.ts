import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, getSession, logoutSession, setSession } from './api';

const user = {
  id: 'customer-1',
  firstName: 'Ana',
  lastName: 'Perez',
  email: 'ana@example.invalid',
  phone: null,
  role: 'CUSTOMER' as const,
};
const original = { user, accessToken: 'old', refreshToken: 'refresh-old' };
const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
describe('authenticated API client', () => {
  beforeEach(() => {
    setSession(original);
  });
  afterEach(() => {
    setSession(null);
    vi.unstubAllGlobals();
  });
  it('rotates a refresh token only once for concurrent unauthorized requests', async () => {
    let rotations = 0;
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        rotations++;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return response(200, { user, accessToken: 'new', refreshToken: 'refresh-new' });
      }
      return (init.headers as Record<string, string>).Authorization === 'Bearer old'
        ? response(401, {})
        : response(200, { success: true });
    });
    vi.stubGlobal('fetch', fetcher);
    const results = await Promise.all([api('/one', {}, true), api('/two', {}, true)]);
    expect(results).toEqual([{ success: true }, { success: true }]);
    expect(rotations).toBe(1);
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
      message: 'Sin mesas',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('preserves the local session if the server cannot revoke it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(logoutSession()).rejects.toMatchObject({ status: 0 });
    expect(getSession()?.user.id).toBe(user.id);
  });
});
