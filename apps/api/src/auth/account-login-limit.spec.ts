import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AccountLoginLimit, AccountLoginLimitException } from './account-login-limit';

describe('account login failure policy', () => {
  afterEach(() => { jest.restoreAllMocks(); });
  const make = () => new AccountLoginLimit(new ConfigService());
  const wrong = async () => { throw new UnauthorizedException('Credenciales inválidas'); };

  it('counts five failures across normalized identities, pauses and never extends the pause on rejection', async () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const limiter = make();
    for (let i = 0; i < 5; i++) await expect(limiter.check(' Ana@Example.com ', wrong)).rejects.toBeInstanceOf(UnauthorizedException);
    const compare = jest.fn(async () => 'authenticated');
    await expect(limiter.check('ana@example.com', compare)).rejects.toMatchObject({ seconds: 60 });
    now += 30000;
    await expect(limiter.check('ANA@example.com', compare)).rejects.toMatchObject({ seconds: 30 });
    expect(compare).not.toHaveBeenCalled();
    now += 30000;
    await expect(limiter.check('ana@example.com', compare)).resolves.toBe('authenticated');
  });

  it('resets failures on success, expires the observation window and isolates other accounts', async () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const limiter = make();
    for (let i = 0; i < 4; i++) await limiter.check('a@example.com', wrong).catch(() => {});
    await limiter.check('a@example.com', async () => true);
    await expect(limiter.check('a@example.com', wrong)).rejects.toBeInstanceOf(UnauthorizedException);
    now += 900000;
    for (let i = 0; i < 5; i++) await expect(limiter.check('a@example.com', wrong)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(limiter.check('a@example.com', wrong)).rejects.toBeInstanceOf(AccountLoginLimitException);
    await expect(limiter.check('b@example.com', async () => true)).resolves.toBe(true);
  });

  it('reserves an account before checking credentials so concurrent requests cannot bypass the counter', async () => {
    const limiter = make();
    let release!: () => void;
    const pending = limiter.check('a@example.com', () => new Promise(resolve => { release = () => resolve(true); }));
    const compare = jest.fn(async () => true);
    await expect(limiter.check('A@example.com', compare)).rejects.toMatchObject({ seconds: 1 });
    expect(compare).not.toHaveBeenCalled();
    release(); await pending;
    await expect(limiter.check('a@example.com', compare)).resolves.toBe(true);
  });

  it('does not count infrastructure failures or keep a lock after they throw', async () => {
    const limiter = make();
    for (let i = 0; i < 7; i++)
      await expect(limiter.check('a@example.com', async () => { throw new Error('database offline'); })).rejects.toThrow('offline');
    await expect(limiter.check('a@example.com', async () => true)).resolves.toBe(true);
  });

  it('bounds memory without evicting active account quotas', async () => {
    const limiter = make();
    const counters = (limiter as any).counters as Map<string, unknown>;
    for (let i = 0; i < 10000; i++) counters.set(String(i), {
      failures: 1, inFlight: false, expires: Date.now() + 900000, blockedUntil: 0,
    });
    const compare = jest.fn(async () => true);
    await expect(limiter.check('new@example.com', compare)).rejects.toMatchObject({ seconds: 60 });
    expect(compare).not.toHaveBeenCalled();
    expect(counters.size).toBe(10000);
  });
});
