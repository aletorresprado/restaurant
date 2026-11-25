import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { MailQueue } from './mail-queue';

const config = (extra = {}) => new ConfigService({ JWT_ACCESS_SECRET: 'fixture-only-secret-with-at-least-32-characters', ...extra });
const message = { to: 'fixture@example.invalid', subject: 'Fixture', text: 'sensitive-token-fixture' };
describe('encrypted persistent mail queue', () => {
  it('authenticates encrypted payloads and survives recreating the worker with the same key', () => {
    const first = new MailQueue({} as any, config(), {} as any);
    const next = new MailQueue({} as any, config(), {} as any);
    const encrypted = first.encrypt(message);
    expect(encrypted).not.toContain(message.to);
    expect(encrypted).not.toContain(message.text);
    expect(next.decrypt(encrypted)).toEqual(message);
    expect(first.encrypt(message)).not.toBe(encrypted);
    expect(() => next.decrypt(encrypted.slice(0, -2) + (encrypted.endsWith('00') ? '01' : '00'))).toThrow();
    const changed = new MailQueue({} as any, config({ MAIL_QUEUE_KEY: 'ab'.repeat(32) }), {} as any);
    expect(() => changed.decrypt(encrypted)).toThrow();
  });
  it('inserts through the caller transaction and never sends before commit', async () => {
    const create = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: 'fixture' });
    const send = jest.fn();
    const worker = new MailQueue({} as any, config(), { send } as any);
    await worker.enqueue({ mailJob: { create } } as any, 'user-id', message, new Date(), 'hash');
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'user-id', tokenHash: 'hash' }) });
    expect(send).not.toHaveBeenCalled();
  });
  it('defers transport failures, fences updates, stops at five attempts and erases payloads', async () => {
    for (const attempts of [1, 2, 3, 4, 5]) {
      const updateMany = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 1 });
      const job: any = { id: 'fixture', userId: 'user', attempts };
      let claimed = false;
      const db: any = { $executeRaw: async () => 0, $queryRaw: async () => claimed ? [] : (claimed = true, [job]),
        user: { findUnique: async () => ({ isActive: true, email: message.to }) }, mailJob: { updateMany } };
      const worker = new MailQueue(db, config(), { send: async () => { throw new Error('private provider detail'); } } as any);
      job.payload = worker.encrypt(message);
      jest.spyOn((worker as any).logger, 'warn').mockImplementation(() => {});
      const started = Date.now();
      const pending = worker.run(); expect(worker.run()).toBe(pending);
      await pending;
      const update = updateMany.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'fixture', status: 'pending', attempts });
      if (attempts === 5) expect(update.data).toMatchObject({ status: 'failed', payload: null, tokenHash: null });
      else expect(update.data.availableAt.getTime()).toBeGreaterThanOrEqual(started + [30, 120, 600, 1800][attempts - 1] * 1000);
      expect(JSON.stringify((worker as any).logger.warn.mock.calls)).not.toContain('private');
      await worker.onModuleDestroy();
    }
  });
  it('cancels replaced or consumed links without sending', async () => {
    const send = jest.fn();
    const updateMany = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 1 });
    const job: any = { id: 'fixture', userId: 'user', tokenHash: 'expired', attempts: 1 };
    let claimed = false;
    const db: any = { $executeRaw: async () => 0, $queryRaw: async () => claimed ? [] : (claimed = true, [job]),
      user: { findUnique: async () => ({ isActive: true, email: message.to }) },
      accountActionToken: { findUnique: async () => null }, mailJob: { updateMany } };
    const worker = new MailQueue(db, config(), { send } as any);
    job.payload = worker.encrypt(message);
    await worker.run();
    expect(send).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled', payload: null }) }));
  });
});
