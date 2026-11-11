import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import { Role } from '@repo/shared-types';
import { BrowserSessionPolicy } from './browser-session';
import { createHash } from 'crypto';

export type UserRequest = Request & { userId: string; userRole: Role };

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: PrismaService, private readonly browser: BrowserSessionPolicy) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<UserRequest>();
    if (request.headers['x-web-session']) {
      const tabId = this.browser.tab(request);
      const secret = this.browser.secret(request, tabId);
      if (!secret) throw new UnauthorizedException('Sesión de navegador no encontrada');
      const session = await this.db.session.findUnique({ where: {
        refreshTokenHash: createHash('sha256').update(secret).digest('hex'),
      }, include: { user: true } });
      if (!session || session.browserTabId !== tabId || session.expiresAt <= new Date() || !session.user.isActive)
        throw new UnauthorizedException('Sesión inválida o vencida');
      request.userId = session.user.id;
      request.userRole = session.user.role as Role;
      return true;
    }
    const match = /^Bearer ([^ ]+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync(match[1]);
      const id = z.string().uuid().parse(payload.sub);
      const user = await this.db.user.findUnique({ where: { id } });
      if (!user?.isActive) throw new UnauthorizedException();
      request.userId = id;
      request.userRole = user.role as Role;
      return true;
    } catch { throw new UnauthorizedException('Token inválido o vencido'); }
  }
}
