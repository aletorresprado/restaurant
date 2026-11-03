import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BUSINESS_CONFIG, calculateLoyaltyTier } from '@repo/config';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class LoyaltyService {
  constructor(private readonly db: PrismaService) {}

  // Every writer locks the owner, including attendance on different branches.
  async apply(tx: Prisma.TransactionClient, data: { userId: string; actorId: string; sourceKey: string; kind: string; requestedPoints: number; reason?: string; reservationId?: string; rating?: number }) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${data.userId}::uuid FOR UPDATE`;
    const previous = await tx.loyaltyMovement.findUnique({ where: { sourceKey: data.sourceKey } });
    if (previous) {
      if (previous.userId !== data.userId || previous.kind !== data.kind || previous.requestedPoints !== data.requestedPoints || previous.reason !== (data.reason ?? null) || previous.rating !== (data.rating ?? null)) throw new ConflictException('La clave de operación ya se usó con otros datos');
      return previous;
    }
    const user = await tx.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const balanceAfter = Math.max(BUSINESS_CONFIG.loyalty.minimumBalance, user.loyaltyBalance + data.requestedPoints);
    if (balanceAfter > 2147483647) throw new ConflictException('El saldo supera el máximo permitido');
    await tx.user.update({ where: { id: data.userId }, data: { loyaltyBalance: balanceAfter } });
    return tx.loyaltyMovement.create({ data: { ...data, points: balanceAfter - user.loyaltyBalance, balanceAfter } });
  }

  async summary(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { loyaltyBalance: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return { balance: user.loyaltyBalance, tier: calculateLoyaltyTier(user.loyaltyBalance) };
  }

  async history(userId: string, page: { page: number; limit: number }) {
    await this.summary(userId);
    const [data, total] = await this.db.$transaction([
      this.db.loyaltyMovement.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page.page - 1) * page.limit, take: page.limit }),
      this.db.loyaltyMovement.count({ where: { userId } }),
    ]);
    return { data, meta: { ...page, total, totalPages: Math.ceil(total / page.limit) } };
  }

  async survey(userId: string, reservationId: string, rating: number) {
    return this.db.$transaction(async tx => {
      const reservation = await tx.reservation.findFirst({ where: { id: reservationId, userId } });
      if (!reservation) throw new NotFoundException('Reserva no encontrada');
      if (reservation.status !== 'ATTENDED' || reservation.endAt > new Date()) throw new ConflictException('La encuesta requiere una asistencia registrada y una reserva finalizada');
      return this.apply(tx, { userId, actorId: userId, sourceKey: `survey:${reservationId}`, kind: 'SURVEY', requestedPoints: BUSINESS_CONFIG.loyalty.surveyReward, reservationId, rating });
    });
  }

  async surveyStatus(userId: string, reservationId: string) {
    const reservation = await this.db.reservation.findFirst({ where: { id: reservationId, userId } });
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    const movement = await this.db.loyaltyMovement.findUnique({ where: { sourceKey: `survey:${reservationId}` }, select: { rating: true } });
    return { submitted: !!movement, rating: movement?.rating ?? null, eligible: reservation.status === 'ATTENDED' && reservation.endAt <= new Date() };
  }

  adjust(userId: string, actorId: string, data: { operationId: string; points: number; reason: string }) {
    return this.db.$transaction(tx => this.apply(tx, { userId, actorId, sourceKey: `adjustment:${userId}:${data.operationId}`, kind: 'ADJUSTMENT', requestedPoints: data.points, reason: data.reason }));
  }
}
