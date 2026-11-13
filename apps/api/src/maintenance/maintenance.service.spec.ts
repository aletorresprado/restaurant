import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MaintenanceService } from './maintenance.service';

describe('expired session/link maintenance', () => {
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
  const settings = (values: Record<string, unknown> = {}) => ({ get: (key: string) => values[key] } as any);

  it('limits work per run, uses a single cutoff and skips overlapping runs', async () => {
    const query = jest.fn<(...args: any[]) => Promise<number>>().mockResolvedValue(10);
    const db = { $transaction: jest.fn(async (fn: any) => fn({ $executeRaw: query })) };
    const service = new MaintenanceService(db as any, settings({ MAINTENANCE_BATCH_SIZE: 10 }));
    const first = service.run(), second = service.run();
    expect(second).toBe(first);
    expect(await first).toEqual({ sessions: 100, links: 100, batches: 10, capped: true });
    expect(db.$transaction).toHaveBeenCalledTimes(10);
    const cutoffs = query.mock.calls.map(call => call[1]);
    expect(new Set(cutoffs).size).toBe(1);
    expect(cutoffs[0]).toBeInstanceOf(Date);
    await service.onModuleDestroy();
  });

  it('stops early on a partial batch and permits a later retry after an error', async () => {
    const query = jest.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('private connection error')).mockResolvedValue(0);
    const db = { $transaction: jest.fn(async (fn: any) => fn({ $executeRaw: query })) };
    const service = new MaintenanceService(db as any, settings());
    await expect(service.run()).rejects.toThrow('private connection error');
    expect(await service.run()).toEqual({ sessions: 0, links: 0, batches: 1, capped: false });
    await service.onModuleDestroy();
  });

  it('schedules at startup/interval, redacts failures, and stops scheduling on shutdown', async () => {
    jest.useFakeTimers();
    const service = new MaintenanceService({} as any, settings({ MAINTENANCE_INTERVAL_SECONDS: 60 }));
    const run = jest.spyOn(service, 'run').mockRejectedValue(new Error('postgresql://secret:password@private'));
    const warning = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledWith('cleanup failed; next scheduled run will retry');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('password');
    await service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('allows disabling the scheduler and waits for an active batch before shutdown', async () => {
    const disabled = new MaintenanceService({} as any, settings({ MAINTENANCE_ENABLED: false }));
    const run = jest.spyOn(disabled, 'run');
    disabled.onApplicationBootstrap();
    expect(run).not.toHaveBeenCalled();
    await disabled.onModuleDestroy();
    let release!: () => void;
    const db = { $transaction: () => new Promise(resolve => { release = () => resolve({ sessions: 500, links: 500 }); }) };
    const active = new MaintenanceService(db as any, settings());
    const pending = active.run();
    let finished = false;
    const shutdown = active.onModuleDestroy().then(() => { finished = true; });
    await Promise.resolve(); expect(finished).toBe(false);
    release(); await shutdown;
    expect((await pending).batches).toBe(1);
    await expect(active.run()).rejects.toThrow('stopping');
  });
});
