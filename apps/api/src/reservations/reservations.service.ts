import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AvailabilityQuery, CreateReservationDto, RecordAttendanceDto } from '@repo/validation';
import { PrismaService } from '../database/prisma.service';
import { OperationsService } from '../operations/operations.service';
import { aligned, canCustomerCancel, canRecordAttendance, durationMs, fits, occupyingStatuses, overlaps } from './rules';

type Tx = Prisma.TransactionClient;
type Page = { page: number; limit: number };
const details = { table: { select: { tableNumber: true } }, branch: { select: { name: true, address: true } }, events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } satisfies Prisma.ReservationInclude;

@Injectable()
export class ReservationsService {
  constructor(private readonly db: PrismaService, private readonly operations: OperationsService) {}

  private async context(tx: Tx, branchId: string, date: string, partySize: number) {
    const branch = await tx.branch.findFirst({ where: { id: branchId, isActive: true } });
    if (!branch) throw new NotFoundException('Sucursal activa no encontrada');
    const hours = await this.operations.resolved(tx, branchId, date);
    if (!hours.window) return { hours, tables: [], reservations: [], blocks: [] };
    const range = { startAt: { lt: hours.window.endAt }, endAt: { gt: hours.window.startAt } };
    const tables = await tx.restaurantTable.findMany({ where: { branchId, tableStatus: 'ACTIVE', capacity: { gte: partySize } }, orderBy: [{ capacity: 'asc' }, { tableNumber: 'asc' }, { id: 'asc' }] });
    const tableIds = tables.map(t => t.id);
    const reservations = await tx.reservation.findMany({ where: { tableId: { in: tableIds }, status: { in: [...occupyingStatuses] }, ...range } });
    const blocks = await tx.tableBlock.findMany({ where: { tableId: { in: tableIds }, ...range } });
    return { hours, tables, reservations, blocks };
  }

  private freeTables(context: Awaited<ReturnType<ReservationsService['context']>>, startAt: Date, endAt: Date) {
    return context.tables.filter(table => !context.reservations.some(r => r.tableId === table.id && overlaps(r, { startAt, endAt })) && !context.blocks.some(b => b.tableId === table.id && overlaps(b, { startAt, endAt })));
  }

  async availability(branchId: string, query: AvailabilityQuery) {
    return this.db.$transaction(async tx => {
      const context = await this.context(tx, branchId, query.date, query.partySize);
      const { hours } = context;
      const slots = [];
      const now = new Date();
      if (hours.window) {
        for (let ms = hours.window.startAt.getTime(); ms + durationMs <= hours.window.endAt.getTime(); ms += hours.reservationIntervalMinutes * 60000) {
          const startAt = new Date(ms), endAt = new Date(ms + durationMs);
          if (startAt <= now) continue;
          const availableTables = this.freeTables(context, startAt, endAt).length;
          if (availableTables) slots.push({ startAt, endAt, availableTables });
        }
      }
      return { date: query.date, partySize: query.partySize, timezone: hours.timezone, durationMinutes: durationMs / 60000, slots };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async create(userId: string, data: CreateReservationDto) {
    return this.db.$transaction(async tx => {
      // Shared with schedule edits, table edits, block creation and branch deactivation.
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${data.branchId}::uuid FOR UPDATE`;
      const context = await this.context(tx, data.branchId, data.serviceDate, data.partySize);
      const startAt = new Date(data.startAt), endAt = new Date(startAt.getTime() + durationMs);
      if (startAt <= new Date()) throw new BadRequestException('La reserva debe comenzar en el futuro');
      if (!fits(startAt, endAt, context.hours.window) || !context.hours.window || !aligned(startAt, context.hours.window.startAt, context.hours.reservationIntervalMinutes)) throw new BadRequestException('El inicio debe coincidir con un turno y la reserva completa debe estar dentro del servicio');
      const table = this.freeTables(context, startAt, endAt)[0];
      if (!table) throw new ConflictException('No quedan mesas disponibles para ese turno y grupo');
      return tx.reservation.create({ data: { userId, branchId: data.branchId, tableId: table.id, serviceDate: data.serviceDate, partySize: data.partySize, startAt, endAt,
        events: { create: { actorId: userId, type: 'RESERVATION_CREATED' } },
      }, include: details });
    }, { timeout: 15000 });
  }

  async mine(userId: string, page: Page) { return this.list({ userId }, page); }
  async agenda(branchId: string, date: string, page: Page) { return this.list({ branchId, serviceDate: date }, page, true); }
  private async list(where: Prisma.ReservationWhereInput, page: Page, staff = false) {
    const [data, total] = await this.db.$transaction([
      this.db.reservation.findMany({ where, include: { ...details, ...(staff ? { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } : {}) }, orderBy: [{ startAt: 'asc' }, { id: 'asc' }], skip: (page.page - 1) * page.limit, take: page.limit }),
      this.db.reservation.count({ where }),
    ]);
    return { data, meta: { page: page.page, limit: page.limit, total, totalPages: Math.ceil(total / page.limit) } };
  }

  async find(id: string, userId?: string, branchId?: string) {
    const reservation = await this.db.reservation.findFirst({ where: { id, ...(userId ? { userId } : {}), ...(branchId ? { branchId } : {}) }, include: details });
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    return reservation;
  }

  async cancel(id: string, actorId: string, reason?: string, branchId?: string) {
    const found = await this.find(id, branchId ? undefined : actorId, branchId);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${found.branchId}::uuid FOR UPDATE`;
      const reservation = await tx.reservation.findUniqueOrThrow({ where: { id } });
      const status = branchId ? 'CANCELLED_BY_RESTAURANT' : 'CANCELLED_BY_CUSTOMER';
      if (reservation.status === status) return tx.reservation.findUniqueOrThrow({ where: { id }, include: details });
      if (reservation.status !== 'CONFIRMED') throw new ConflictException('La reserva ya no está confirmada');
      const now = new Date();
      if (reservation.startAt <= now) throw new ConflictException('No se puede cancelar una reserva iniciada');
      if (!branchId && !canCustomerCancel(reservation.startAt, now)) throw new ForbiddenException('El cliente debe cancelar con al menos 6 horas de anticipación');
      return tx.reservation.update({ where: { id }, data: { status, events: { create: { actorId, type: branchId ? 'RESTAURANT_CANCELLED' : 'CUSTOMER_CANCELLED', reason } } }, include: details });
    });
  }

  async recordAttendance(branchId: string, id: string, actorId: string, data: RecordAttendanceDto) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${branchId}::uuid FOR UPDATE`;
      const reservation = await tx.reservation.findFirst({ where: { id, branchId } });
      if (!reservation) throw new NotFoundException('Reserva no encontrada en esta sucursal');
      if (reservation.status === data.outcome) return tx.reservation.findUniqueOrThrow({ where: { id }, include: details });
      if (reservation.status !== 'CONFIRMED') throw new ConflictException('Solo se puede registrar asistencia sobre una reserva confirmada; no se modifica un resultado ya registrado');
      if (!canRecordAttendance(reservation.startAt, new Date(), data.outcome)) throw new ConflictException(data.outcome === 'NO_SHOW' ? 'Todavía no transcurrió la tolerancia configurada para registrar una ausencia' : 'La reserva todavía no comenzó');
      return tx.reservation.update({ where: { id }, data: {
        status: data.outcome,
        events: { create: { actorId, type: data.outcome === 'ATTENDED' ? 'ATTENDANCE_CONFIRMED' : 'NO_SHOW_RECORDED', reason: data.reason } },
      }, include: details });
    });
  }
}
