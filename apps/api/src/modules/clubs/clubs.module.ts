import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';

import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

import { ClubAdminAssignmentsService } from './club-admin-assignments.service';

import { ClubEligibilityService } from './club-eligibility.service';

import { BoardAppointmentsController } from './board-appointments.controller';
import { BoardAppointmentsService } from './board-appointments.service';

import { PublicClubLeadershipController } from './public-club-leadership.controller';

import { MembershipWindowReconcilerService } from './membership-window-reconciler.service';

import { ClubImagesController } from './club-images.controller';
import {
  BoardNominationsController,
} from './board-nominations.controller';

import {
  BoardNominationsService,
} from './board-nominations.service';

@Module({
  imports: [
    AuthModule,
    JwtModule.register({}),
  ],

 controllers: [
  ClubsController,
  BoardAppointmentsController,
  PublicClubLeadershipController,
  ClubImagesController,

  BoardNominationsController,
],

  providers: [
  ClubsService,
  ClubAdminAssignmentsService,
  ClubEligibilityService,
  BoardAppointmentsService,
  MembershipWindowReconcilerService,

  BoardNominationsService,
],

  exports: [
  ClubsService,
  ClubAdminAssignmentsService,
  ClubEligibilityService,
  BoardAppointmentsService,

  BoardNominationsService,
],
})
export class ClubsModule {}