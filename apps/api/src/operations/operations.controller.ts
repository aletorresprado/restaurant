import { applyDecorators, BadRequestException, Body, CanActivate, Controller, Delete, ExecutionContext, Get, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@repo/shared-types';
import { CreateRestaurantTableDto, CreateRestaurantTableSchema, UpdateRestaurantTableDto, CreateTableBlockDto, CreateTableBlockSchema, CreateBranchScheduleDto, CreateBranchScheduleSchema, UpdateBranchScheduleDto, UpdateBranchScheduleSchema, CreateBranchScheduleExceptionDto, CreateBranchScheduleExceptionSchema, UpdateBranchScheduleExceptionDto, UpdateBranchScheduleExceptionSchema } from '@repo/validation';
import { z } from 'zod';
import { AccessGuard, UserRequest } from '../auth/access.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ZodPipe } from '../common/zod.pipe';
import { HoursQuerySchema, ListQuerySchema, TablePatchSchema } from './operations.schemas';
import { OperationsService } from './operations.service';

@Injectable()
export class OperationalBranchGuard implements CanActivate {
  constructor(private readonly operations: OperationsService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<UserRequest>();
    const branchId = z.string().uuid().safeParse(request.params.branchId);
    if (!branchId.success) throw new BadRequestException('branchId debe ser UUID');
    await this.operations.access(branchId.data, request);
    return true;
  }
}
const Pages = () => applyDecorators(ApiQuery({ name: 'page', type: Number, required: false }), ApiQuery({ name: 'limit', type: Number, required: false }));
const times = { openingTime: { type: 'string', example: '20:00' }, closingTime: { type: 'string', example: '02:00' } } as const;
const scheduleProperties = { ...times, dayOfWeek: { type: 'integer', minimum: 1, maximum: 7 }, reservationIntervalMinutes: { type: 'integer', minimum: 15, maximum: 120 }, isActive: { type: 'boolean' } } as const;
const exceptionProperties = { ...times, date: { type: 'string', format: 'date' }, isClosed: { type: 'boolean' }, reason: { type: 'string' } } as const;
const SchedulePatch = UpdateBranchScheduleSchema.innerType().strict().pipe(UpdateBranchScheduleSchema).refine(v => Object.keys(v).length > 0, 'Enviar al menos un campo');
const ExceptionPatch = UpdateBranchScheduleExceptionSchema.innerType().strict().pipe(UpdateBranchScheduleExceptionSchema).refine(v => Object.keys(v).length > 0, 'Enviar al menos un campo');

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(AccessGuard, RolesGuard, OperationalBranchGuard)
@Roles(Role.STAFF, Role.ADMIN)
@Controller('staff/branches/:branchId')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}
  @Get('tables') @Pages()
  tables(@Param('branchId', ParseUUIDPipe) branchId: string, @Query(new ZodPipe(ListQuerySchema)) page: z.infer<typeof ListQuerySchema>) { return this.operations.tables(branchId, page); }
  @Post('tables')
  @ApiBody({ schema: { type: 'object', required: ['tableNumber', 'capacity'], properties: { tableNumber: { type: 'string', example: 'A-1' }, capacity: { type: 'integer', minimum: 1, maximum: 50 } } } })
  createTable(@Param('branchId', ParseUUIDPipe) branchId: string, @Body(new ZodPipe(CreateRestaurantTableSchema.strict())) data: CreateRestaurantTableDto) { return this.operations.createTable(branchId, data); }
  @Patch('tables/:tableId')
  @ApiBody({ schema: { type: 'object', properties: { capacity: { type: 'integer', minimum: 1, maximum: 50 }, tableStatus: { type: 'string', enum: ['ACTIVE', 'BLOCKED', 'OUT_OF_SERVICE'] } } } })
  updateTable(@Param('branchId', ParseUUIDPipe) branchId: string, @Param('tableId', ParseUUIDPipe) tableId: string, @Body(new ZodPipe(TablePatchSchema)) data: UpdateRestaurantTableDto) { return this.operations.updateTable(branchId, tableId, data); }
  @Get('tables/:tableId/blocks') @Pages()
  blocks(@Param('branchId', ParseUUIDPipe) branchId: string, @Param('tableId', ParseUUIDPipe) tableId: string, @Query(new ZodPipe(ListQuerySchema)) page: z.infer<typeof ListQuerySchema>) { return this.operations.blocks(branchId, tableId, page); }
  @Post('tables/:tableId/blocks')
  @ApiBody({ schema: { type: 'object', required: ['startAt', 'endAt', 'reason'], properties: { startAt: { type: 'string', format: 'date-time', example: '2026-11-02T20:00:00-03:00' }, endAt: { type: 'string', format: 'date-time', example: '2026-11-02T22:00:00-03:00' }, reason: { type: 'string', example: 'Mantenimiento' } } } })
  block(@Param('branchId', ParseUUIDPipe) branchId: string, @Param('tableId', ParseUUIDPipe) tableId: string, @Body(new ZodPipe(CreateTableBlockSchema.innerType().strict().pipe(CreateTableBlockSchema))) data: CreateTableBlockDto) { return this.operations.block(branchId, tableId, data); }
  @Delete('tables/:tableId/blocks/:blockId')
  unblock(@Param('branchId', ParseUUIDPipe) branchId: string, @Param('tableId', ParseUUIDPipe) tableId: string, @Param('blockId', ParseUUIDPipe) blockId: string) { return this.operations.unblock(branchId, tableId, blockId); }
  @Get('schedules')
  schedules(@Param('branchId', ParseUUIDPipe) branchId: string) { return this.operations.schedules(branchId); }
  @Post('schedules')
  @ApiBody({ schema: { type: 'object', required: ['dayOfWeek', 'openingTime', 'closingTime'], properties: scheduleProperties } })
  createSchedule(@Param('branchId', ParseUUIDPipe) branchId: string, @Body(new ZodPipe(CreateBranchScheduleSchema.innerType().strict().pipe(CreateBranchScheduleSchema))) data: CreateBranchScheduleDto) { return this.operations.createSchedule(branchId, data); }
  @Patch('schedules/:scheduleId')
  @ApiBody({ schema: { type: 'object', properties: { openingTime: times.openingTime, closingTime: times.closingTime, reservationIntervalMinutes: scheduleProperties.reservationIntervalMinutes, isActive: scheduleProperties.isActive } } })
  updateSchedule(@Param('branchId', ParseUUIDPipe) branchId: string, @Param('scheduleId', ParseUUIDPipe) id: string, @Body(new ZodPipe(SchedulePatch)) data: UpdateBranchScheduleDto) { return this.operations.updateSchedule(branchId, id, data); }
  @Delete('schedules/:scheduleId')
  removeSchedule(@Param('branchId', ParseUUIDPipe) branchId: string, @Param('scheduleId', ParseUUIDPipe) id: string) { return this.operations.removeSchedule(branchId, id); }
  @Get('schedule-exceptions') @Pages()
  exceptions(@Param('branchId', ParseUUIDPipe) branchId: string, @Query(new ZodPipe(ListQuerySchema)) page: z.infer<typeof ListQuerySchema>) { return this.operations.exceptions(branchId, page); }
  @Post('schedule-exceptions')
  @ApiBody({ schema: { type: 'object', required: ['date'], properties: exceptionProperties } })
  createException(@Param('branchId', ParseUUIDPipe) branchId: string, @Body(new ZodPipe(CreateBranchScheduleExceptionSchema.innerType().strict().pipe(CreateBranchScheduleExceptionSchema))) data: CreateBranchScheduleExceptionDto) { return this.operations.createException(branchId, data); }
  @Patch('schedule-exceptions/:exceptionId')
  @ApiBody({ schema: { type: 'object', properties: { openingTime: times.openingTime, closingTime: times.closingTime, isClosed: exceptionProperties.isClosed, reason: exceptionProperties.reason } } })
  updateException(@Param('branchId', ParseUUIDPipe) branchId: string, @Param('exceptionId', ParseUUIDPipe) id: string, @Body(new ZodPipe(ExceptionPatch)) data: UpdateBranchScheduleExceptionDto) { return this.operations.updateException(branchId, id, data); }
  @Delete('schedule-exceptions/:exceptionId')
  removeException(@Param('branchId', ParseUUIDPipe) branchId: string, @Param('exceptionId', ParseUUIDPipe) id: string) { return this.operations.removeException(branchId, id); }
}

@ApiTags('branches')
@Controller('branches/:branchId')
export class PublicHoursController {
  constructor(private readonly operations: OperationsService) {}
  @Get('hours')
  @ApiOperation({ summary: 'Servicio iniciado en una fecha local; excepción prevalece sobre horario semanal' })
  @ApiQuery({ name: 'date', required: true, type: String, example: '2026-11-02' })
  hours(@Param('branchId', ParseUUIDPipe) branchId: string, @Query(new ZodPipe(HoursQuerySchema)) query: { date: string }) { return this.operations.hours(branchId, query.date); }
}
