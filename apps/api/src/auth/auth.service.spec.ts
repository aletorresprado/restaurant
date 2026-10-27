import { AuthService } from './auth.service';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';

describe('AuthService sessions', () => {
  const user = { id: 'user-1', email: 'customer@example.com', firstName: 'Ana', lastName: 'Perez', phone: null, role: 'CUSTOMER', isActive: true, passwordHash: 'private' };
  let db: any;
  let service: AuthService;
  beforeEach(() => {
    db = { session: { findUnique: jest.fn(), deleteMany: jest.fn(), create: jest.fn() }, user: { findUnique: jest.fn() } };
    db.$transaction = (fn: any) => fn(db);
    service = new AuthService(db, { signAsync: jest.fn<() => Promise<string>>().mockResolvedValue('access-token') } as any,
      { getOrThrow: jest.fn().mockReturnValue('7d') } as any);
  });

  it('rotates refresh tokens and stores only their digest', async () => {
    db.session.findUnique.mockResolvedValue({ id: 'session-1', user, expiresAt: new Date(Date.now() + 60000) });
    db.session.deleteMany.mockResolvedValue({ count: 1 });
    const result = await service.refresh('old-token');
    expect(result.refreshToken).not.toBe('old-token');
    expect(db.session.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: user.id, refreshTokenHash: createHash('sha256').update(result.refreshToken).digest('hex'),
    }) });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects expired sessions without issuing another token', async () => {
    db.session.findUnique.mockResolvedValue({ user, expiresAt: new Date(0) });
    await expect(service.refresh('expired')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.session.create).not.toHaveBeenCalled();
  });

  it('rejects a refresh token consumed by a concurrent request', async () => {
    db.session.findUnique.mockResolvedValue({ id: 'session-1', user, expiresAt: new Date(Date.now() + 60000) });
    db.session.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.refresh('used')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.session.create).not.toHaveBeenCalled();
  });

  it('rejects deactivated users on protected requests', async () => {
    db.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    await expect(service.me(user.id)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs out idempotently using the token digest', async () => {
    await expect(service.logout('token')).resolves.toEqual({ success: true });
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: {
      refreshTokenHash: createHash('sha256').update('token').digest('hex'),
    } });
  });
});
