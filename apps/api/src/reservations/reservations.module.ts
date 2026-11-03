import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OperationsModule } from '../operations/operations.module';
import { AvailabilityController, ReservationsController, StaffReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';
@Module({ imports: [AuthModule, OperationsModule, LoyaltyModule], providers: [ReservationsService], controllers: [AvailabilityController, ReservationsController, StaffReservationsController] })
export class ReservationsModule {}
