import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards, HttpCode, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@repo/shared-types';
import { AvailabilityQuery, AvailabilityQuerySchema, CancelReservationSchema, CreateReservationDto, CreateReservationSchema, RecordAttendanceDto, RecordAttendanceSchema } from '@repo/validation';
import { z } from 'zod';
import { AccessGuard, UserRequest } from '../auth/access.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ZodPipe } from '../common/zod.pipe';
import { OperationalBranchGuard } from '../operations/operations.controller';
import { ListQuerySchema } from '../operations/operations.schemas';
import { ReservationsService } from './reservations.service';

const Pages = () => applyDecorators(ApiQuery({ name: 'page', required: false, type: Number }), ApiQuery({ name: 'limit', required: false, type: Number }));
const AgendaQuery = ListQuerySchema.extend({ date: z.string().date() }).strict();
const ReasonBody = () => ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string', minLength: 3, maxLength: 500 } } } });

@ApiTags('availability')
@Controller('branches/:branchId/availability')
export class AvailabilityController {
  constructor(private readonly reservations: ReservationsService) {}
  @Get()
  @ApiOperation({ summary: 'Turnos libres para una fecha de inicio de servicio; consulta orientativa' })
  @ApiQuery({ name: 'date', type: String, example: '2026-11-02' })
  @ApiQuery({ name: 'partySize', type: Number, example: 4 })
  availability(@Param('branchId', ParseUUIDPipe) id: string, @Query(new ZodPipe(AvailabilityQuerySchema)) query: AvailabilityQuery) { return this.reservations.availability(id, query); }
}

@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CUSTOMER)
  @ApiBody({ schema: { type: 'object', required: ['branchId', 'serviceDate', 'startAt', 'partySize'], additionalProperties: false, properties: {
    branchId: { type: 'string', format: 'uuid' }, serviceDate: { type: 'string', format: 'date', example: '2026-11-02' },
    startAt: { type: 'string', format: 'date-time', example: '2026-11-02T20:00:00-03:00' }, partySize: { type: 'integer', minimum: 1, maximum: 50 },
  } } })
  create(@Req() request: UserRequest, @Body(new ZodPipe(CreateReservationSchema)) body: CreateReservationDto) { return this.reservations.create(request.userId, body); }
  @Get() @Pages()
  mine(@Req() request: UserRequest, @Query(new ZodPipe(ListQuerySchema)) page: z.infer<typeof ListQuerySchema>) { return this.reservations.mine(request.userId, page); }
  @Get(':id')
  find(@Req() request: UserRequest, @Param('id', ParseUUIDPipe) id: string) { return this.reservations.find(id, request.userId); }
  @Post(':id/cancel') @HttpCode(200) @ReasonBody()
  cancel(@Req() request: UserRequest, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CancelReservationSchema)) body: { reason?: string }) { return this.reservations.cancel(id, request.userId, body.reason); }
}

@ApiTags('staff/reservations')
@ApiBearerAuth()
@UseGuards(AccessGuard, RolesGuard, OperationalBranchGuard)
@Roles(Role.STAFF, Role.ADMIN)
@Controller('staff/branches/:branchId/reservations')
export class StaffReservationsController {
  constructor(private readonly reservations: ReservationsService) {}
  @Get() @Pages()
  @ApiQuery({ name: 'date', type: String, example: '2026-11-02' })
  @ApiOperation({ summary: 'Agenda por fecha de inicio del servicio, incluyendo reservas canceladas' })
  agenda(@Param('branchId', ParseUUIDPipe) branchId: string, @Query(new ZodPipe(AgendaQuery)) query: z.infer<typeof AgendaQuery>) { return this.reservations.agenda(branchId, query.date, query); }
  @Get(':id')
  find(@Param('branchId', ParseUUIDPipe) branchId: string, @Param('id', ParseUUIDPipe) id: string) { return this.reservations.find(id, undefined, branchId); }
  @Post(':id/attendance') @HttpCode(200)
  @ApiOperation({ summary: 'Registrar asistencia desde el inicio o ausencia después de la tolerancia; sin puntos en esta etapa' })
  @ApiBody({ schema: { type: 'object', required: ['outcome'], additionalProperties: false, properties: { outcome: { type: 'string', enum: ['ATTENDED', 'NO_SHOW'] }, reason: { type: 'string', minLength: 3, maxLength: 500 } } } })
  attendance(@Req() request: UserRequest, @Param('branchId', ParseUUIDPipe) branchId: string, @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(RecordAttendanceSchema)) body: RecordAttendanceDto) { return this.reservations.recordAttendance(branchId, id, request.userId, body); }
  @Post(':id/cancel') @HttpCode(200)
  @ApiBody({ schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 3, maxLength: 500 } } } })
  cancel(@Req() request: UserRequest, @Param('branchId', ParseUUIDPipe) branchId: string, @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CancelReservationSchema.extend({ reason: z.string().trim().min(3).max(500) }))) body: { reason: string }) { return this.reservations.cancel(id, request.userId, body.reason, branchId); }
}
