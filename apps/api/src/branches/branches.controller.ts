import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@repo/shared-types';
import { CreateBranchDto, CreateBranchSchema, UpdateBranchDto } from '@repo/validation';
import { AccessGuard, UserRequest } from '../auth/access.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ZodPipe } from '../common/zod.pipe';
import { BranchesService } from './branches.service';
import { BranchPatchSchema, BranchQuery, BranchQuerySchema, UserRoleSchema } from './branches.schemas';

const properties = {
  name: { type: 'string', minLength: 2, maxLength: 100 },
  address: { type: 'string', minLength: 5, maxLength: 255 },
  phone: { type: 'string' }, latitude: { type: 'number', minimum: -90, maximum: 90 },
  longitude: { type: 'number', minimum: -180, maximum: 180 }, isActive: { type: 'boolean' },
} as const;
const PageQueries = () => (target: object, key: string, descriptor: PropertyDescriptor) => {
  ApiQuery({ name: 'page', required: false, type: Number, description: 'Página desde 1 (por defecto 1)' })(target, key, descriptor);
  ApiQuery({ name: 'limit', required: false, type: Number, description: 'Entre 1 y 100 (por defecto 20)' })(target, key, descriptor);
};

@ApiTags('branches')
@Controller('branches')
export class PublicBranchesController {
  constructor(private readonly branches: BranchesService) {}
  @Get()
  @PageQueries()
  @ApiOperation({ summary: 'Consultar sucursales activas; acceso público' })
  list(@Query(new ZodPipe(BranchQuerySchema)) query: BranchQuery) { return this.branches.list(query, 'public'); }
  @Get(':id')
  @ApiOperation({ summary: 'Consultar una sucursal activa' })
  find(@Param('id', ParseUUIDPipe) id: string) { return this.branches.find(id, true); }
}

@ApiTags('admin/branches')
@ApiBearerAuth()
@UseGuards(AccessGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/branches')
export class AdminBranchesController {
  constructor(private readonly branches: BranchesService) {}
  @Get()
  @PageQueries()
  @ApiOperation({ summary: 'Listar sucursales activas e inactivas' })
  list(@Query(new ZodPipe(BranchQuerySchema)) query: BranchQuery) { return this.branches.list(query, 'admin'); }
  @Get(':id')
  find(@Param('id', ParseUUIDPipe) id: string) { return this.branches.find(id); }
  @Post()
  @ApiBody({ schema: { type: 'object', required: ['name', 'address'], properties } })
  create(@Body(new ZodPipe(CreateBranchSchema)) body: CreateBranchDto) { return this.branches.create(body); }
  @Patch(':id')
  @ApiOperation({ summary: 'Editar o desactivar una sucursal (isActive: false)' })
  @ApiBody({ schema: { type: 'object', minProperties: 1, additionalProperties: false, properties } })
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(BranchPatchSchema)) body: UpdateBranchDto) { return this.branches.update(id, body); }
  @Get(':id/staff')
  staff(@Param('id', ParseUUIDPipe) id: string) { return this.branches.staff(id); }
  @Put(':id/staff/:userId')
  @ApiOperation({ summary: 'Asignar personal STAFF activo; operación idempotente' })
  assign(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) { return this.branches.assign(id, userId); }
  @Delete(':id/staff/:userId')
  @ApiOperation({ summary: 'Retirar asignación sin eliminar el usuario' })
  unassign(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) { return this.branches.unassign(id, userId); }
}

@ApiTags('staff/branches')
@ApiBearerAuth()
@UseGuards(AccessGuard, RolesGuard)
@Roles(Role.STAFF, Role.ADMIN)
@Controller('staff/branches')
export class StaffBranchesController {
  constructor(private readonly branches: BranchesService) {}
  @Get()
  @PageQueries()
  @ApiOperation({ summary: 'Listar sucursales activas asignadas; ADMIN ve todas las activas' })
  list(@Query(new ZodPipe(BranchQuerySchema)) query: BranchQuery, @Req() request: UserRequest) {
    return this.branches.list(query, 'staff', request.userId, request.userRole);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Consultar sucursal asignada; ADMIN tiene acceso global' })
  find(@Param('id', ParseUUIDPipe) id: string, @Req() request: UserRequest) {
    return this.branches.staffBranch(id, request.userId, request.userRole);
  }
}

@ApiTags('admin/users')
@ApiBearerAuth()
@UseGuards(AccessGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly branches: BranchesService) {}
  @Get()
  @PageQueries()
  @ApiOperation({ summary: 'Consultar usuarios para gestionar personal; sin hashes ni sesiones' })
  users(@Query(new ZodPipe(BranchQuerySchema)) query: BranchQuery) { return this.branches.users(query); }
  @Patch(':id/role')
  @ApiOperation({ summary: 'Cambiar CUSTOMER/STAFF; no crea ni modifica administradores. CUSTOMER pierde asignaciones.' })
  @ApiBody({ schema: { type: 'object', required: ['role'], additionalProperties: false, properties: { role: { type: 'string', enum: ['CUSTOMER', 'STAFF'] } } } })
  setRole(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(UserRoleSchema)) body: { role: 'CUSTOMER' | 'STAFF' }) {
    return this.branches.setRole(id, body.role);
  }
}
