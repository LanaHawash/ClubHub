import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';

import { ClubsModule } from '../clubs/clubs.module';

import {
  PaymentsController,
} from './payments.controller';

import {
  PaymentsService,
} from './payments.service';

import {
  PaymentConfirmationService,
} from './payment-confirmation.service';

@Module({
  imports: [
    AuthModule,
    ClubsModule,
    JwtModule.register({}),
  ],

  controllers: [
    PaymentsController,
  ],

  providers: [
    PaymentsService,
    PaymentConfirmationService,
  ],

  exports: [
    PaymentsService,
    PaymentConfirmationService,
  ],
})
export class PaymentsModule {}