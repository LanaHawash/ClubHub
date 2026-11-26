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

import {
  OnlinePaymentsController,
} from './online-payments.controller';

import {
  OnlinePaymentsService,
} from './online-payments.service';

import {
  SimulatedPaymentProvider,
} from './providers/simulated-payment.provider';

import {
  ONLINE_PAYMENT_PROVIDER,
} from './providers/payment-provider.interface';
import {
  PaymentProviderEventsController,
} from './payment-provider-events.controller';

import {
  PaymentProviderEventsService,
} from './payment-provider-events.service';
import {
  PaymentSimulationController,
} from './payment-simulation.controller';

import {
  PaymentSimulationService,
} from './payment-simulation.service';

@Module({
  imports: [
    AuthModule,
    ClubsModule,
    JwtModule.register({}),
  ],

  controllers: [
    PaymentsController,
    OnlinePaymentsController,
    PaymentProviderEventsController,
    PaymentSimulationController,
  ],

  providers: [
    PaymentsService,
    PaymentConfirmationService,
    OnlinePaymentsService,
    SimulatedPaymentProvider,
    PaymentProviderEventsService,
    PaymentSimulationService,

    {
      provide: ONLINE_PAYMENT_PROVIDER,

      useExisting: SimulatedPaymentProvider,
    },
  ],

  exports: [
    PaymentsService,
    PaymentConfirmationService,
    OnlinePaymentsService,
    PaymentProviderEventsService,
  ],
})
export class PaymentsModule {}