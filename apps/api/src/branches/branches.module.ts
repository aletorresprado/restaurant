import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BranchesService } from './branches.service';
import { AdminBranchesController, AdminUsersController, PublicBranchesController, StaffBranchesController } from './branches.controller';
import { AdminBranchImageController, BranchImagesService, PublicBranchImageController } from './branch-images';

@Module({ imports: [AuthModule], providers: [BranchesService, BranchImagesService], exports: [BranchesService], controllers: [
  AdminBranchImageController, PublicBranchImageController,
  AdminBranchesController, AdminUsersController, PublicBranchesController, StaffBranchesController,
] })
export class BranchesModule {}
