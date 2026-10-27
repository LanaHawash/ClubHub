import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { ClubAdminAssignmentsService } from './club-admin-assignments.service';
import { ClubEligibilityService } from './club-eligibility.service';
import { BoardAppointmentsController } from './board-appointments.controller';
import { BoardAppointmentsService } from './board-appointments.service';

@Module({
  imports: [
    AuthModule,
    JwtModule.register({}),
  ],
  controllers: [
  ClubsController,
  BoardAppointmentsController,
],
  providers: [
    ClubsService,
    ClubAdminAssignmentsService,
    ClubEligibilityService,
    BoardAppointmentsService,
  ],
})
export class ClubsModule {}