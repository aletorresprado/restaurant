import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessGuard } from './access.guard';

@Module({
  imports: [JwtModule.registerAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => ({
    secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    signOptions: { expiresIn: config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'), algorithm: 'HS256' },
    verifyOptions: { algorithms: ['HS256'] },
  }) })],
  controllers: [AuthController], providers: [AuthService, AccessGuard],
})
export class AuthModule {}
