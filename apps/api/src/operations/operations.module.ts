import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BranchesModule } from '../branches/branches.module';
import { OperationalBranchGuard, OperationsController, PublicHoursController } from './operations.controller';
import { OperationsService } from './operations.service';
@Module({ imports: [AuthModule, BranchesModule], providers: [OperationsService, OperationalBranchGuard], exports: [OperationsService, OperationalBranchGuard], controllers: [OperationsController, PublicHoursController] })
export class OperationsModule {}
