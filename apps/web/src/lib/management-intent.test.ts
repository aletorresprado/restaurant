import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { establishSession, setSession } from './api';
import { prepareManagement, clearManagement, managedPost } from './management-intent';

const actor = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const user = {
  id: actor,
  firstName: 'Admin',
  lastName: 'Temporal',
  email: 'admin@example.invalid',
  phone: null,
  role: 'ADMIN' as const,
};
const path = '/admin/branches';
const body = { name: 'Temporal', address: 'Temporal 123' };
const response = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
describe('recoverable management writes', () => {
  let values: Map<string, string>;
  beforeEach(async () => {
    values = new Map();
    const sessionValues = new Map();
    const storage = (map: Map<string, string>) => ({
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
      removeItem: (key: string) => map.delete(key),
    });
    vi.stubGlobal('localStorage', storage(values));
    vi.stubGlobal('sessionStorage', storage(sessionValues));
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('navigator', {
      locks: {
        request: (_key: string, a: unknown, b?: (lock: unknown) => unknown) =>
          Promise.resolve().then(() => (b ? b({}) : (a as () => unknown)())),
      },
    });
    await establishSession({ user });
  });
  afterEach(() => {
    setSession(null);
    vi.unstubAllGlobals();
  });
  it('shares one draft UUID across competing reviews', async () => {
    const destination = `/admin/users/${other}/loyalty/adjustments`;
    const a = await prepareManagement(
      actor,
      destination,
      { operationId: crypto.randomUUID(), points: 5, reason: 'Temporal' },
      false,
    );
    const b = await prepareManagement(
      actor,
      destination,
      { operationId: crypto.randomUUID(), points: 5, reason: 'Temporal' },
      false,
    );
    expect(a.operationId).toBe(b.operationId);
    expect(a.attempted).toBe(false);
  });
  it('does not change or discard an attempted operation as a draft', async () => {
    const original = await prepareManagement(actor, path, body);
    await expect(prepareManagement(actor, path, { ...body, name: 'Different' })).rejects.toThrow(
      'pendiente',
    );
    const current = await prepareManagement(actor, path, body, false);
    expect(current.attempted).toBe(true);
    await clearManagement(actor, current, true);
    expect((await prepareManagement(actor, path, body)).operationId).toBe(original.operationId);
  });
  it('separates accounts and never clears a newer operation', async () => {
    const original = await prepareManagement(actor, path, body);
    const foreign = await prepareManagement(other, path, body);
    expect(original.operationId).not.toBe(foreign.operationId);
    await clearManagement(actor, original);
    const newer = await prepareManagement(actor, path, { ...body, name: 'New' });
    await clearManagement(actor, original);
    expect((await prepareManagement(actor, path, newer.body)).operationId).toBe(newer.operationId);
  });
  it('fails before sending if storage, coordination or path is unsafe', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(managedPost('https://evil.example', body)).rejects.toThrow();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    });
    await expect(managedPost(path, body)).rejects.toThrow('guardar');
    vi.stubGlobal('navigator', {});
    await expect(managedPost(path, body)).rejects.toThrow('coordinación');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('reuses the exact persisted key and body after losing a response', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValueOnce(response(201, { id: 'created' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(managedPost(path, body)).rejects.toMatchObject({ status: 0 });
    expect(values.size).toBe(1);
    await expect(managedPost(path, body)).resolves.toEqual({ id: 'created' });
    const [first, second] = fetcher.mock.calls.map((call) => call[1] as RequestInit);
    expect(first.body).toBe(second.body);
    expect(new Headers(first.headers).get('Idempotency-Key')).toBe(
      new Headers(second.headers).get('Idempotency-Key'),
    );
    expect(values.size).toBe(0);
  });
  it('preserves mismatched keys but removes definite rejections', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response(409, { code: 'OPERATION_MISMATCH', message: 'Different content' }),
        )
        .mockResolvedValueOnce(response(400, { message: 'Invalid' })),
    );
    await expect(managedPost(path, body)).rejects.toMatchObject({ code: 'OPERATION_MISMATCH' });
    expect(values.size).toBe(1);
    await expect(managedPost(path, body)).rejects.toMatchObject({ status: 400 });
    expect(values.size).toBe(0);
  });
  it('does not send a prepared write under a different login', async () => {
    let release!: () => void;
    vi.stubGlobal('navigator', {
      locks: {
        request: (_key: string, action: () => unknown) =>
          new Promise((resolve) => {
            release = () => resolve(action());
          }),
      },
    });
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const pending = managedPost(path, body);
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    setSession({ user: { ...user, id: other } });
    release();
    await rejected;
    expect(fetcher).not.toHaveBeenCalled();
    expect(values.size).toBe(1);
  });
});
