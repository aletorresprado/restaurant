import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, mkdir, readdir, rm, writeFile, utimes, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { LocalMailRetentionService } from './local-mail-retention.service';

describe('local mailbox retention', () => {
  const directories: string[] = [];
  const services: LocalMailRetentionService[] = [];
  async function setup(values: Record<string, unknown> = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'resto-mail-retention-'));
    directories.push(directory);
    const config = { MAIL_OUTBOX_DIR: directory, ...values };
    const service = new LocalMailRetentionService({ get: (key: string) => config[key as keyof typeof config] } as any);
    services.push(service);
    return { directory, service };
  }
  async function message(directory: string, age: number, modifiedAge = age) {
    const name = `${Date.now() - age * 86400000}-${randomUUID()}.json`;
    const file = join(directory, name);
    await writeFile(file, 'fixture-only');
    const date = new Date(Date.now() - modifiedAge * 86400000);
    await utimes(file, date, date);
    return name;
  }
  afterEach(async () => {
    for (const service of services.splice(0)) await service.onModuleDestroy();
    // Every target is an absolute temporary directory created by this test.
    for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('removes only expired generated messages and preserves recent, modified and unrelated files', async () => {
    const { directory, service } = await setup();
    await message(directory, 8);
    const recent = await message(directory, 1);
    const modified = await message(directory, 8, 0);
    await writeFile(join(directory, 'notes.json'), 'fixture');
    const nested = join(directory, 'nested');
    await mkdir(nested); await message(nested, 9);
    const first = service.run();
    expect(service.run()).toBe(first);
    expect(await first).toEqual({ removed: 1, scanned: 5, capped: false });
    expect((await readdir(directory)).sort()).toEqual([recent, modified, 'notes.json', 'nested'].sort());
    expect(await readdir(nested)).toHaveLength(1);
    expect((await service.run()).removed).toBe(0);
  });

  it('bounds deletion and continues on a later pass', async () => {
    const { directory, service } = await setup({ MAIL_LOCAL_RETENTION_DAYS: 1 });
    for (let index = 0; index < 501; index++) await message(directory, 2);
    expect(await service.run()).toEqual({ removed: 500, scanned: 500, capped: true });
    expect((await service.run()).removed).toBe(1);
  });

  it('does nothing for SMTP, production or disabled maintenance', async () => {
    for (const values of [{ MAIL_MODE: 'smtp' }, { NODE_ENV: 'production' }, { MAINTENANCE_ENABLED: false }]) {
      const { directory, service } = await setup(values);
      await message(directory, 10);
      expect((await service.run()).removed).toBe(0);
      expect(await readdir(directory)).toHaveLength(1);
    }
  });

  it('handles a missing mailbox and refuses a directory junction', async () => {
    const { directory, service } = await setup();
    await rm(directory, { recursive: true });
    expect((await service.run()).scanned).toBe(0);
    await mkdir(directory);
    const target = await mkdtemp(join(tmpdir(), 'resto-mail-target-'));
    directories.push(target);
    await message(target, 10);
    const link = join(directory, 'mailbox');
    await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    const linked = new LocalMailRetentionService({ get: (key: string) => key === 'MAIL_OUTBOX_DIR' ? link : undefined } as any);
    services.push(linked);
    await expect(linked.run()).rejects.toThrow('Invalid local mailbox');
    expect(await readdir(target)).toHaveLength(1);
  });

  it('logs only generic failures, schedules and stops at shutdown', async () => {
    const { service } = await setup();
    const run = jest.spyOn(service, 'run').mockRejectedValue(new Error('private mailbox path'));
    const warning = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
    service.onApplicationBootstrap();
    await new Promise(resolve => setImmediate(resolve));
    expect(run).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith('local mail cleanup failed; next scheduled run will retry');
    await service.onModuleDestroy();
    run.mockRestore();
    await expect(service.run()).rejects.toThrow('stopping');
  });
});
