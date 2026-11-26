import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  PrismaService,
} from '../../shared/prisma/prisma.service';

import {
  SimulatedPaymentProvider,
} from './providers/simulated-payment.provider';

import {
  PaymentProviderEventsService,
} from './payment-provider-events.service';

import type {
  ProviderPaymentOutcome,
} from './providers/payment-provider.interface';

@Injectable()
export class PaymentSimulationService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly config: ConfigService,

    private readonly provider:
      SimulatedPaymentProvider,

    private readonly eventsService:
      PaymentProviderEventsService,
  ) {}

  async simulateOutcome(
    administratorAccountId: string,
    attemptId: string,
    outcome: ProviderPaymentOutcome,
  ) {
    const enabled =
      this.config.get<string>(
        'ENABLE_PAYMENT_SIMULATION',
      ) === 'true';

    const environment =
      this.config.get<string>('NODE_ENV');

    /*
     * The simulation control must never operate
     * in a production environment.
     */
    if (
      !enabled ||
      (
        environment !== 'development' &&
        environment !== 'test'
      )
    ) {
      throw new NotFoundException(
        'Payment simulation is unavailable.',
      );
    }

    const account =
      await this.prisma.account.findUnique({
        where: {
          id: administratorAccountId,
        },

        select: {
          role: true,
          status: true,
        },
      });

    if (
      !account ||
      account.role !== 'DEANSHIP' ||
      account.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException(
        'Only active Deanship accounts can control payment simulations.',
      );
    }

    if (
      outcome !== 'SUCCEEDED' &&
      outcome !== 'FAILED' &&
      outcome !== 'UNKNOWN'
    ) {
      throw new BadRequestException(
        'Invalid simulation outcome.',
      );
    }

    const attempt =
      await this.prisma.paymentAttempt.findUnique({
        where: {
          id: attemptId,
        },

        include: {
          payment: true,
        },
      });

    if (!attempt) {
      throw new NotFoundException(
        'Payment attempt not found.',
      );
    }

    if (
      attempt.provider !== 'SIMULATED' ||
      attempt.payment.provider !== 'SIMULATED' ||
      attempt.payment.method !== 'ONLINE'
    ) {
      throw new ConflictException(
        'Only simulated online payments are supported.',
      );
    }

    if (
      attempt.status !== 'PROCESSING' &&
      attempt.status !== 'UNKNOWN'
    ) {
      throw new ConflictException(
        'This attempt is no longer eligible for simulation.',
      );
    }

    if (!attempt.providerAttemptRef) {
      throw new ConflictException(
        'Payment attempt has no provider reference.',
      );
    }

    const clock =
      await this.prisma.$queryRaw<{ now: Date }[]>`
        SELECT clock_timestamp() AS now
      `;

    const event =
      this.provider.createSignedEvent({
        providerAttemptRef:
          attempt.providerAttemptRef,

        outcome,

        amount:
          attempt.payment.amount.toFixed(2),

        currency:
          attempt.payment.currency,

        occurredAt:
          clock[0].now,

        failureCode:
          outcome === 'FAILED'
            ? 'SIMULATED_DECLINE'
            : undefined,
      });

    /*
     * Process the event through the normal
     * verified provider callback workflow.
     */
    return this.eventsService.processSignedEvent(
      event,
    );
  }
}