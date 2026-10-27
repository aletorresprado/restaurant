import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { LoginDto, LoginSchema, RefreshTokenDto, RefreshTokenSchema, RegisterDto, RegisterSchema } from '@repo/validation';
import { ZodPipe } from '../common/zod.pipe';
import { AccessGuard, UserRequest } from './access.guard';
import { AuthService } from './auth.service';

const credentials = { type: 'object', required: ['email', 'password'], properties: {
  email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' },
} } as const;
const refreshBody = { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } as const;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiBody({ schema: { type: 'object', required: ['firstName', 'lastName', 'email', 'password'], properties: {
    ...credentials.properties, firstName: { type: 'string' }, lastName: { type: 'string' }, phone: { type: 'string' },
  } } })
  register(@Body(new ZodPipe(RegisterSchema)) body: RegisterDto) { return this.auth.register(body); }

  @Post('login')
  @HttpCode(200)
  @ApiBody({ schema: { ...credentials, required: [...credentials.required] } })
  login(@Body(new ZodPipe(LoginSchema)) body: LoginDto) { return this.auth.login(body); }

  @Post('refresh')
  @HttpCode(200)
  @ApiBody({ schema: { ...refreshBody, required: [...refreshBody.required] } })
  refresh(@Body(new ZodPipe(RefreshTokenSchema)) body: RefreshTokenDto) { return this.auth.refresh(body.refreshToken); }

  @Post('logout')
  @HttpCode(200)
  @ApiBody({ schema: { ...refreshBody, required: [...refreshBody.required] } })
  logout(@Body(new ZodPipe(RefreshTokenSchema)) body: RefreshTokenDto) { return this.auth.logout(body.refreshToken); }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AccessGuard)
  me(@Req() request: UserRequest) { return this.auth.me(request.userId); }
}
