import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { LoginDto, LoginSchema, RegisterDto, RegisterSchema } from '@repo/validation';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { BrowserSessionPolicy } from './browser-session';

@ApiTags('auth/web')
@Controller('auth/web')
export class BrowserAuthController {
  constructor(private readonly auth: AuthService, private readonly policy: BrowserSessionPolicy) {}
  private async signIn(request: Request, response: Response, input: LoginDto | RegisterDto, register: boolean) {
    const tabId = this.policy.tab(request);
    const value = await this.auth.browserLogin(tabId, input, register);
    response.setHeader('Cache-Control', 'no-store');
    response.cookie(this.policy.cookieName(tabId), value.secret, this.policy.options());
    return { user: value.user };
  }
  @Post('login') @HttpCode(200)
  @ApiOperation({ summary: 'Ingreso web por cookie HttpOnly; requiere X-Web-Session y Origin permitido. No devuelve tokens.' })
  login(@Req() request: Request, @Res({ passthrough: true }) response: Response,
    @Body(new ZodPipe(LoginSchema)) input: LoginDto) { return this.signIn(request, response, input, false); }
  @Post('register')
  register(@Req() request: Request, @Res({ passthrough: true }) response: Response,
    @Body(new ZodPipe(RegisterSchema)) input: RegisterDto) { return this.signIn(request, response, input, true); }
  @Post('logout') @HttpCode(200)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tabId = this.policy.tab(request);
    const result = await this.auth.browserLogout(tabId, this.policy.secret(request, tabId));
    response.setHeader('Cache-Control', 'no-store');
    response.clearCookie(this.policy.cookieName(tabId), this.policy.options());
    return result;
  }
}
