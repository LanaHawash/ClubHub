import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';
import { ClubsModule } from '../clubs/clubs.module';

import { MembershipApplicationsController } from './membership-applications.controller';
import { MembershipApplicationsService } from './membership-applications.service';
import {
  MembershipLifecycleService,
} from './membership-lifecycle.service';

@Module({
  imports: [
    AuthModule,
    ClubsModule,
    JwtModule.register({}),
  ],

  controllers: [
    MembershipApplicationsController,
  ],

  providers: [
    MembershipApplicationsService,
    MembershipLifecycleService,
  ],

  exports: [
    MembershipApplicationsService,
    MembershipLifecycleService,
  ],
})
export class MembershipApplicationsModule {}