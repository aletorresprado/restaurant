import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role } from '@repo/shared-types';
import { CreateBranchDto, UpdateBranchDto } from '@repo/validation';
import { PrismaService } from '../database/prisma.service';
import { BranchQuery } from './branches.schemas';
import { occupyingStatuses } from '../reservations/rules';

const staffFields = { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true } as const;

@Injectable()
export class BranchesService {
  constructor(private readonly db: PrismaService) {}

  async list(query: BranchQuery, scope: 'public' | 'admin' | 'staff', userId?: string, role?: Role) {
    const where: Prisma.BranchWhereInput = scope === 'admin' ? {} : {
      isActive: true,
      ...(scope === 'staff' && role !== Role.ADMIN ? { staff: { some: { userId } } } : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.branch.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      this.db.branch.count({ where }),
    ]);
    return { data, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
  }

  async find(id: string, activeOnly = false) {
    const branch = await this.db.branch.findFirst({ where: { id, ...(activeOnly ? { isActive: true } : {}) } });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    return branch;
  }

  async staffBranch(id: string, userId: string, role: Role) {
    const branch = await this.find(id, role !== Role.ADMIN);
    if (role !== Role.ADMIN && !await this.db.branchStaff.findUnique({ where: { branchId_userId: { branchId: id, userId } } })) {
      throw new ForbiddenException('No estás asignado a esta sucursal');
    }
    return branch;
  }

  create(data: CreateBranchDto) { return this.db.branch.create({ data }); }

  async update(id: string, data: UpdateBranchDto) {
    const existing = await this.find(id);
    if (((data.latitude ?? existing.latitude) == null) !== ((data.longitude ?? existing.longitude) == null)) {
      throw new BadRequestException('latitude y longitude deben proporcionarse juntos o ninguno');
    }
    try { return await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${id}::uuid FOR UPDATE`;
      if (data.isActive === false && await tx.reservation.findFirst({ where: { branchId: id, status: { in: [...occupyingStatuses] }, endAt: { gt: new Date() } } })) throw new ConflictException('La sucursal tiene reservas vigentes');
      return tx.branch.update({ where: { id }, data });
    }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('Sucursal no encontrada');
      throw error;
    }
  }

  async staff(id: string) {
    await this.find(id);
    return this.db.branchStaff.findMany({ where: { branchId: id }, select: { createdAt: true, user: { select: staffFields } }, orderBy: { userId: 'asc' } });
  }

  async assign(branchId: string, userId: string) {
    await this.find(branchId);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      if (!user.isActive || user.role !== 'STAFF') throw new BadRequestException('Solo se puede asignar personal activo con rol STAFF');
      await tx.branchStaff.upsert({ where: { branchId_userId: { branchId, userId } }, create: { branchId, userId }, update: {} });
      return { success: true };
    });
  }

  async unassign(branchId: string, userId: string) {
    await this.find(branchId);
    await this.db.branchStaff.deleteMany({ where: { branchId, userId } });
    return { success: true };
  }

  async users(query: BranchQuery) {
    const [data, total] = await this.db.$transaction([
      this.db.user.findMany({ select: staffFields, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: { id: 'asc' } }),
      this.db.user.count(),
    ]);
    return { data, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
  }

  async setRole(id: string, role: 'CUSTOMER' | 'STAFF') {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      if (user.role === 'ADMIN') throw new ForbiddenException('Este endpoint no modifica administradores');
      await tx.user.update({ where: { id }, data: { role } });
      if (role === 'CUSTOMER') await tx.branchStaff.deleteMany({ where: { userId: id } });
      return tx.user.findUniqueOrThrow({ where: { id }, select: staffFields });
    });
  }
}
