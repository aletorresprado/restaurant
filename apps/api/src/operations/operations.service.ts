import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateRestaurantTableDto, UpdateRestaurantTableDto, CreateTableBlockDto, CreateBranchScheduleDto, UpdateBranchScheduleDto, CreateBranchScheduleExceptionDto, UpdateBranchScheduleExceptionDto } from '@repo/validation';
import { PrismaService } from '../database/prisma.service';
import { BranchesService } from '../branches/branches.service';
import { UserRequest } from '../auth/access.guard';
import { isoDay, nextDate, timezone, weeklyOverlap, windowFor } from './time';
import { occupyingStatuses } from '../reservations/rules';

type Tx = Prisma.TransactionClient;
type Page = { page: number; limit: number };
@Injectable()
export class OperationsService {
  constructor(private readonly db: PrismaService, private readonly branches: BranchesService) {}
  async access(branchId: string, request: UserRequest) { await this.branches.staffBranch(branchId, request.userId, request.userRole); }
  private async table(tx: Tx, branchId: string, id: string) {
    const table = await tx.restaurantTable.findFirst({ where: { id, branchId } });
    if (!table) throw new NotFoundException('Mesa no encontrada en esta sucursal');
    return table;
  }
  private async mapped<T>(action: () => Promise<T>) {
    try { return await action(); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('Ya existe ese número de mesa, día semanal o fecha en la sucursal');
        if (error.code === 'P2025') throw new NotFoundException('Registro no encontrado');
      }
      throw error;
    }
  }
  async tables(branchId: string, page: Page) {
    const where = { branchId };
    const [data, total] = await this.db.$transaction([
      this.db.restaurantTable.findMany({ where, orderBy: [{ tableNumber: 'asc' }, { id: 'asc' }], skip: (page.page - 1) * page.limit, take: page.limit }), this.db.restaurantTable.count({ where }),
    ]);
    return { data, meta: { ...page, total, totalPages: Math.ceil(total / page.limit) } };
  }
  createTable(branchId: string, data: CreateRestaurantTableDto) { return this.mapped(() => this.db.restaurantTable.create({ data: { branchId, ...data } })); }
  async updateTable(branchId: string, id: string, data: UpdateRestaurantTableDto) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${branchId}::uuid FOR UPDATE`;
      await this.table(tx, branchId, id);
      const confirmed = await tx.reservation.findMany({ where: { tableId: id, status: { in: [...occupyingStatuses] }, endAt: { gt: new Date() } } });
      if (confirmed.some(r => (data.capacity !== undefined && data.capacity < r.partySize) || (data.tableStatus !== undefined && data.tableStatus !== 'ACTIVE'))) throw new ConflictException('La mesa tiene reservas confirmadas que impiden este cambio');
      return tx.restaurantTable.update({ where: { id }, data });
    });
  }
  async blocks(branchId: string, tableId: string, page: Page) {
    await this.table(this.db, branchId, tableId);
    const [data, total] = await this.db.$transaction([
      this.db.tableBlock.findMany({ where: { tableId }, orderBy: [{ startAt: 'asc' }, { id: 'asc' }], skip: (page.page - 1) * page.limit, take: page.limit }), this.db.tableBlock.count({ where: { tableId } }),
    ]);
    return { data, meta: { ...page, total, totalPages: Math.ceil(total / page.limit) } };
  }
  async block(branchId: string, tableId: string, data: CreateTableBlockDto) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${branchId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "RestaurantTable" WHERE id = ${tableId}::uuid FOR UPDATE`;
      await this.table(tx, branchId, tableId);
      const startAt = new Date(data.startAt), endAt = new Date(data.endAt);
      if (await tx.reservation.findFirst({ where: { tableId, status: { in: [...occupyingStatuses] }, startAt: { lt: endAt }, endAt: { gt: startAt } } })) throw new ConflictException('El bloqueo entra en conflicto con una reserva vigente');
      if (await tx.tableBlock.findFirst({ where: { tableId, startAt: { lt: endAt }, endAt: { gt: startAt } } })) throw new ConflictException('El bloqueo se superpone con otro de la mesa');
      return tx.tableBlock.create({ data: { tableId, startAt, endAt, reason: data.reason } });
    });
  }
  async unblock(branchId: string, tableId: string, id: string) {
    await this.table(this.db, branchId, tableId);
    const removed = await this.db.tableBlock.deleteMany({ where: { id, tableId } });
    if (!removed.count) throw new NotFoundException('Bloqueo no encontrado en esta mesa');
    return { success: true };
  }
  schedules(branchId: string) { return this.db.branchSchedule.findMany({ where: { branchId }, orderBy: { dayOfWeek: 'asc' } }); }
  async exceptions(branchId: string, page: Page) {
    const [data, total] = await this.db.$transaction([
      this.db.branchScheduleException.findMany({ where: { branchId }, orderBy: { date: 'asc' }, skip: (page.page - 1) * page.limit, take: page.limit }), this.db.branchScheduleException.count({ where: { branchId } }),
    ]);
    return { data, meta: { ...page, total, totalPages: Math.ceil(total / page.limit) } };
  }
  async resolved(tx: Tx, branchId: string, date: string) {
    const exception = await tx.branchScheduleException.findUnique({ where: { branchId_date: { branchId, date } } });
    const schedule = await tx.branchSchedule.findUnique({ where: { branchId_dayOfWeek: { branchId, dayOfWeek: isoDay(date) } } });
    const source = exception ? 'EXCEPTION' : schedule?.isActive ? 'WEEKLY' : 'NONE';
    const closed = exception ? exception.isClosed : !schedule?.isActive;
    const hours = exception ?? schedule;
    return { date, timezone, source, isClosed: closed, reservationIntervalMinutes: schedule?.isActive ? schedule.reservationIntervalMinutes : 30,
      window: !closed && hours?.openingTime && hours.closingTime ? windowFor(date, { openingTime: hours.openingTime, closingTime: hours.closingTime }) : null };
  }
  async hours(branchId: string, date: string) { await this.branches.find(branchId, true); return this.resolved(this.db, branchId, date); }
  private async validateHours(tx: Tx, branchId: string) {
    const schedules = await tx.branchSchedule.findMany({ where: { branchId } });
    if (weeklyOverlap(schedules)) throw new ConflictException('Los horarios semanales se superponen');
    const exceptions = await tx.branchScheduleException.findMany({ where: { branchId } });
    const dates = new Set(exceptions.flatMap(e => [nextDate(e.date, -1), e.date]));
    for (const date of dates) {
      const a = await this.resolved(tx, branchId, date), b = await this.resolved(tx, branchId, nextDate(date));
      if (a.window && b.window && a.window.endAt > b.window.startAt) throw new ConflictException('La excepción se superpone con el servicio del día contiguo');
    }
  }
  private scheduleTransaction<T>(branchId: string, action: (tx: Tx) => Promise<T>) {
    return this.mapped(() => this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${branchId}::uuid FOR UPDATE`;
      const result = await action(tx);
      await this.validateHours(tx, branchId);
      const reservations = await tx.reservation.findMany({ where: { branchId, status: { in: [...occupyingStatuses] }, endAt: { gt: new Date() } } });
      for (const reservation of reservations) {
        const hours = await this.resolved(tx, branchId, reservation.serviceDate);
        if (!hours.window || reservation.startAt < hours.window.startAt || reservation.endAt > hours.window.endAt) throw new ConflictException('El cambio deja una reserva confirmada fuera del horario');
      }
      return result;
    }, { timeout: 15000 }));
  }
  createSchedule(branchId: string, data: CreateBranchScheduleDto) { return this.scheduleTransaction(branchId, tx => tx.branchSchedule.create({ data: { branchId, ...data } })); }
  updateSchedule(branchId: string, id: string, data: UpdateBranchScheduleDto) {
    return this.scheduleTransaction(branchId, async tx => {
      const existing = await tx.branchSchedule.findFirst({ where: { id, branchId } });
      if (!existing) throw new NotFoundException('Horario no encontrado en esta sucursal');
      const merged = { ...existing, ...data };
      if (merged.openingTime === merged.closingTime) throw new BadRequestException('La apertura y cierre no pueden ser iguales');
      return tx.branchSchedule.update({ where: { id }, data });
    });
  }
  removeSchedule(branchId: string, id: string) {
    return this.scheduleTransaction(branchId, async tx => {
      if (!(await tx.branchSchedule.deleteMany({ where: { id, branchId } })).count) throw new NotFoundException('Horario no encontrado');
      return { success: true };
    });
  }
  createException(branchId: string, data: CreateBranchScheduleExceptionDto) {
    return this.scheduleTransaction(branchId, tx => tx.branchScheduleException.create({ data: { branchId, ...data, ...(data.isClosed ? { openingTime: null, closingTime: null } : {}) } }));
  }
  updateException(branchId: string, id: string, data: UpdateBranchScheduleExceptionDto) {
    return this.scheduleTransaction(branchId, async tx => {
      const existing = await tx.branchScheduleException.findFirst({ where: { id, branchId } });
      if (!existing) throw new NotFoundException('Excepción no encontrada en esta sucursal');
      const merged = { ...existing, ...data };
      if (!merged.isClosed && (!merged.openingTime || !merged.closingTime || merged.openingTime === merged.closingTime)) throw new BadRequestException('Una excepción abierta requiere apertura y cierre diferentes');
      return tx.branchScheduleException.update({ where: { id }, data: { ...data, ...(merged.isClosed ? { openingTime: null, closingTime: null } : {}) } });
    });
  }
  removeException(branchId: string, id: string) {
    return this.scheduleTransaction(branchId, async tx => {
      if (!(await tx.branchScheduleException.deleteMany({ where: { id, branchId } })).count) throw new NotFoundException('Excepción no encontrada');
      return { success: true };
    });
  }
}
