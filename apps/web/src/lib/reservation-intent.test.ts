import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { prepareReservation, finishReservation } from './reservation-intent';

const user = '10000000-0000-4000-8000-000000000001';
const selection = {
  branchId: '20000000-0000-4000-8000-000000000001',
  serviceDate: '2030-01-01',
  startAt: '2030-01-01T21:00:00Z',
  endAt: '2030-01-01T23:00:00Z',
  partySize: 2,
};
describe('durable reservation intents', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('navigator', {
      locks: { request: (_name: string, action: () => unknown) => Promise.resolve().then(action) },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('reuses the persisted operation for concurrent identical selections', async () => {
    const [a, b] = await Promise.all([
      prepareReservation(user, selection),
      prepareReservation(user, selection),
    ]);
    expect(a.operationId).toBe(b.operationId);
    expect(JSON.parse([...values.values()][0]).operationId).toBe(a.operationId);
  });
  it('does not replace an unresolved operation with changed details', async () => {
    const original = await prepareReservation(user, selection);
    await expect(prepareReservation(user, { ...selection, partySize: 3 })).rejects.toThrow(
      'pendiente',
    );
    expect((await prepareReservation(user, selection)).operationId).toBe(original.operationId);
  });
  it('keeps completed results and does not clear another operation', async () => {
    const original = await prepareReservation(user, selection);
    await finishReservation(user, original.operationId, '30000000-0000-4000-8000-000000000001');
    expect(values.size).toBe(0);
    const copy = await prepareReservation(user, {
      ...selection,
      operationId: original.operationId,
    });
    expect(copy.operationId).toBe(original.operationId);
    await finishReservation(user, copy.operationId, '30000000-0000-4000-8000-000000000001');
    const next = await prepareReservation(user, { ...selection, partySize: 3 });
    await finishReservation(user, original.operationId);
    expect((await prepareReservation(user, { ...selection, partySize: 3 })).operationId).toBe(
      next.operationId,
    );
  });
  it('isolates accounts and removes only the definitely rejected attempt', async () => {
    const a = await prepareReservation(user, selection);
    const b = await prepareReservation('another-user', selection);
    expect(a.operationId).not.toBe(b.operationId);
    await finishReservation(user, a.operationId);
    expect(values.size).toBe(1);
  });
  it('fails closed for corrupted or unavailable durable storage', async () => {
    values.set(`app-resto-reservation-intent:${user}`, 'broken');
    await expect(prepareReservation(user, selection)).rejects.toThrow();
    values.clear();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    });
    await expect(prepareReservation(user, selection)).rejects.toThrow('guardar');
  });
  it('requires cross-tab coordination before preparing an operation', async () => {
    vi.stubGlobal('navigator', {});
    await expect(prepareReservation(user, selection)).rejects.toThrow('coordinar');
    expect(values.size).toBe(0);
  });
});
