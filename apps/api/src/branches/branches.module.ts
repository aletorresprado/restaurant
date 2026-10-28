import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BranchesService } from './branches.service';
import { AdminBranchesController, AdminUsersController, PublicBranchesController, StaffBranchesController } from './branches.controller';

@Module({ imports: [AuthModule], providers: [BranchesService], exports: [BranchesService], controllers: [
  AdminBranchesController, AdminUsersController, PublicBranchesController, StaffBranchesController,
] })
export class BranchesModule {}
