import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessGuard } from './access.guard';
import { RolesGuard } from './roles.guard';
import { BrowserSessionPolicy } from './browser-session';
import { BrowserAuthController } from './browser-auth.controller';
import { APP_FILTER } from '@nestjs/core';
import { AccountLoginLimit, AccountLoginLimitFilter } from './account-login-limit';
import { AccountActionsController } from './account-actions.controller';
import { AccountActionsService } from './account-actions.service';
import { AccountMail } from './account-mail';

@Module({
  imports: [JwtModule.registerAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => ({
    secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    signOptions: { expiresIn: config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'), algorithm: 'HS256' },
    verifyOptions: { algorithms: ['HS256'] },
  }) })],
  controllers: [AuthController, BrowserAuthController, AccountActionsController], providers: [AuthService, AccessGuard, RolesGuard, BrowserSessionPolicy,
    AccountActionsService, AccountMail,
    AccountLoginLimit, { provide: APP_FILTER, useClass: AccountLoginLimitFilter }],
  exports: [AccessGuard, RolesGuard, JwtModule, BrowserSessionPolicy],
})
export class AuthModule {}
