import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@repo/shared-types';
import { z } from 'zod';
import { AccessGuard, UserRequest } from '../auth/access.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ZodPipe } from '../common/zod.pipe';
import { ListQuerySchema } from '../operations/operations.schemas';
import { LoyaltyService } from './loyalty.service';

const Survey = z.object({ rating: z.number().int().min(1).max(5) }).strict();
const Adjustment = z.object({ operationId: z.string().uuid(), points: z.number().int().min(-10000).max(10000).refine(n => n !== 0), reason: z.string().trim().min(3).max(500) }).strict();
type Page = z.infer<typeof ListQuerySchema>;

@ApiTags('loyalty') @ApiBearerAuth() @UseGuards(AccessGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}
  @Get('me') summary(@Req() req: UserRequest) { return this.loyalty.summary(req.userId); }
  @Get('me/movements')
  @ApiQuery({ name: 'page', required: false, type: Number }) @ApiQuery({ name: 'limit', required: false, type: Number })
  history(@Req() req: UserRequest, @Query(new ZodPipe(ListQuerySchema)) page: Page) { return this.loyalty.history(req.userId, page); }
  @Get('reservations/:id/survey')
  surveyStatus(@Req() req: UserRequest, @Param('id', ParseUUIDPipe) id: string) { return this.loyalty.surveyStatus(req.userId, id); }
  @Post('reservations/:id/survey') @HttpCode(200) @UseGuards(RolesGuard) @Roles(Role.CUSTOMER)
  @ApiBody({ schema: { type: 'object', required: ['rating'], additionalProperties: false, properties: { rating: { type: 'integer', minimum: 1, maximum: 5 } } } })
  survey(@Req() req: UserRequest, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Survey)) body: z.infer<typeof Survey>) { return this.loyalty.survey(req.userId, id, body.rating); }
}

@ApiTags('admin/loyalty') @ApiBearerAuth() @UseGuards(AccessGuard, RolesGuard) @Roles(Role.ADMIN)
@Controller('admin/users/:userId/loyalty')
export class AdminLoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}
  @Get() summary(@Param('userId', ParseUUIDPipe) id: string) { return this.loyalty.summary(id); }
  @Get('movements')
  @ApiQuery({ name: 'page', required: false, type: Number }) @ApiQuery({ name: 'limit', required: false, type: Number })
  history(@Param('userId', ParseUUIDPipe) id: string, @Query(new ZodPipe(ListQuerySchema)) page: Page) { return this.loyalty.history(id, page); }
  @Post('adjustments') @HttpCode(200)
  @ApiBody({ schema: { type: 'object', required: ['operationId', 'points', 'reason'], additionalProperties: false, properties: { operationId: { type: 'string', format: 'uuid' }, points: { type: 'integer', minimum: -10000, maximum: 10000 }, reason: { type: 'string', minLength: 3, maxLength: 500 } } } })
  adjust(@Req() req: UserRequest, @Param('userId', ParseUUIDPipe) id: string, @Body(new ZodPipe(Adjustment)) body: z.infer<typeof Adjustment>) { return this.loyalty.adjust(id, req.userId, body); }
}
