import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminLoyaltyController, LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
@Module({ imports: [AuthModule], controllers: [LoyaltyController, AdminLoyaltyController], providers: [LoyaltyService], exports: [LoyaltyService] })
export class LoyaltyModule {}
