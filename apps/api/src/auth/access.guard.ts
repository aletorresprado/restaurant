import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';

export type UserRequest = Request & { userId: string };

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<UserRequest>();
    const match = /^Bearer ([^ ]+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync(match[1]);
      const id = z.string().uuid().parse(payload.sub);
      const user = await this.db.user.findUnique({ where: { id } });
      if (!user?.isActive) throw new UnauthorizedException();
      request.userId = id;
      return true;
    } catch { throw new UnauthorizedException('Token inválido o vencido'); }
  }
}
