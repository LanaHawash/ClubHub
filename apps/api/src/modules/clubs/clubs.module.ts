import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { ClubAdminAssignmentsService } from './club-admin-assignments.service';

@Module({
  imports: [
    AuthModule,
    JwtModule.register({}),
  ],
  controllers: [ClubsController],
  providers: [
    ClubsService,
    ClubAdminAssignmentsService,
  ],
})
export class ClubsModule {}