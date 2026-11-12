import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { AccountEmailSchema, AccountTokenSchema, ResetPasswordDto, ResetPasswordSchema } from '@repo/validation';
import { ZodPipe } from '../common/zod.pipe';
import { AccountActionsService } from './account-actions.service';

@ApiTags('auth/account')
@Controller('auth')
export class AccountActionsController {
  constructor(private readonly actions: AccountActionsService) {}
  @Post('forgot-password') @HttpCode(200)
  @ApiBody({ schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } })
  forgot(@Body(new ZodPipe(AccountEmailSchema)) body: { email: string }) { return this.actions.request(body.email, 'RESET_PASSWORD'); }
  @Post('request-email-verification') @HttpCode(200)
  @ApiBody({ schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } })
  request(@Body(new ZodPipe(AccountEmailSchema)) body: { email: string }) { return this.actions.request(body.email, 'VERIFY_EMAIL'); }
  @Post('reset-password') @HttpCode(200)
  @ApiBody({ schema: { type: 'object', required: ['token', 'password', 'confirmPassword'], properties: {
    token: { type: 'string' }, password: { type: 'string', format: 'password' }, confirmPassword: { type: 'string', format: 'password' },
  } } })
  reset(@Body(new ZodPipe(ResetPasswordSchema)) body: ResetPasswordDto) { return this.actions.confirm(body.token, 'RESET_PASSWORD', body); }
  @Post('verify-email') @HttpCode(200)
  @ApiBody({ schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } })
  verify(@Body(new ZodPipe(AccountTokenSchema)) body: { token: string }) { return this.actions.confirm(body.token, 'VERIFY_EMAIL'); }
}
