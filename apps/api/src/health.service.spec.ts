import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { HealthService } from './health.service';

describe('PostgreSQL readiness', () => {
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
  it('shares concurrent probes and caches the result for one second', async () => {
    let now = 10000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const query = jest.fn<() => Promise<any[]>>().mockResolvedValue([{ '?column?': 1 }]);
    const service = new HealthService({ $queryRaw: query } as any);
    const results = await Promise.all([service.ready(), service.ready(), service.ready()]);
    expect(results[0].checks.database).toBe('up');
    expect(query).toHaveBeenCalledTimes(1);
    await service.ready(); expect(query).toHaveBeenCalledTimes(1);
    now += 1000;
    await service.ready(); expect(query).toHaveBeenCalledTimes(2);
  });

  it('returns a generic unavailable result and recovers after database errors', async () => {
    let now = 10000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const query = jest.fn<() => Promise<any[]>>().mockRejectedValueOnce(new Error('postgresql://secret@host'))
      .mockResolvedValue([]);
    const service = new HealthService({ $queryRaw: query } as any);
    await expect(service.ready()).rejects.toMatchObject({ response: {
      status: 'error', service: 'App Resto API', checks: { database: 'down' },
    }, status: 503 });
    now += 1000;
    expect((await service.ready()).checks.database).toBe('up');
  });

  it('times out without creating more probes while the original query remains pending', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    const query = jest.fn(() => new Promise<any[]>(resolve => { release = () => resolve([]); }));
    const service = new HealthService({ $queryRaw: query } as any);
    const rejected = expect(service.ready()).rejects.toMatchObject({ status: 503 });
    await jest.advanceTimersByTimeAsync(2000); await rejected;
    const again = expect(service.ready()).rejects.toMatchObject({ status: 503 });
    await jest.advanceTimersByTimeAsync(1000); await again;
    const third = expect(service.ready()).rejects.toMatchObject({ status: 503 });
    await jest.advanceTimersByTimeAsync(2000); await third;
    expect(query).toHaveBeenCalledTimes(1);
    release(); await jest.advanceTimersByTimeAsync(0);
    expect((await service.ready()).checks.database).toBe('up');
  });
});
