import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import type {
  OnlinePaymentProvider,
  InitiateProviderPaymentInput,
  InitiateProviderPaymentResult,
  VerifiedProviderPaymentEvent,
  SignedProviderPaymentEvent,
  ProviderPaymentOutcome,
} from './payment-provider.interface';

@Injectable()
export class SimulatedPaymentProvider
  implements OnlinePaymentProvider
{
  readonly name = 'SIMULATED' as const;

  constructor(
    private readonly config: ConfigService,
  ) {}

  private getSigningSecret(): string {
    const secret =
      this.config.get<string>(
        'SIMULATED_PAYMENT_WEBHOOK_SECRET',
      );

    if (!secret || secret.length < 32) {
      throw new Error(
        'Simulated payment signing secret is missing or too short.',
      );
    }

    return secret;
  }

  private signPayload(
    payload: string,
  ): string {
    return createHmac(
      'sha256',
      this.getSigningSecret(),
    )
      .update(payload, 'utf8')
      .digest('hex');
  }

  async initiatePayment(
    input: InitiateProviderPaymentInput,
  ): Promise<InitiateProviderPaymentResult> {
    /*
     * Deterministic references make repeated initiation
     * with the same payment and attempt identifiers
     * idempotent.
     */

    return {
      provider: this.name,

      providerPaymentId:
        `sim-payment-${input.paymentId}`,

      providerAttemptRef:
        `sim-attempt-${input.attemptId}`,

      status: 'PROCESSING',
    };
  }

  /**
   * Generates a signed event inside the simulation.
   *
   * This method must never be exposed directly through
   * an unauthenticated or student-controlled endpoint.
   */
  createSignedEvent(input: {
    providerAttemptRef: string;
    outcome: ProviderPaymentOutcome;
    amount: string;
    currency: string;
    occurredAt: Date;
    failureCode?: string;
  }): SignedProviderPaymentEvent {
    const payload = JSON.stringify({
      provider: this.name,

      providerEventId: randomUUID(),

      providerAttemptRef:
        input.providerAttemptRef,

      outcome: input.outcome,

      amount: input.amount,

      currency: input.currency,

      occurredAt:
        input.occurredAt.toISOString(),

      failureCode:
        input.failureCode,
    });

    return {
      payload,

      signature:
        this.signPayload(payload),
    };
  }

  /**
   * Verifies the signature before trusting
   * any event content.
   */
  verifyEvent(
    event: SignedProviderPaymentEvent,
  ): VerifiedProviderPaymentEvent {
    if (
      typeof event.payload !== 'string' ||
      typeof event.signature !== 'string'
    ) {
      throw new BadRequestException(
        'Invalid payment event.',
      );
    }

    if (
      !/^[a-fA-F0-9]{64}$/.test(
        event.signature,
      )
    ) {
      throw new UnauthorizedException(
        'Invalid payment event signature.',
      );
    }

    const expectedSignature = Buffer.from(
      this.signPayload(event.payload),
      'hex',
    );

    const receivedSignature = Buffer.from(
      event.signature,
      'hex',
    );

    if (
      !timingSafeEqual(
        expectedSignature,
        receivedSignature,
      )
    ) {
      throw new UnauthorizedException(
        'Invalid payment event signature.',
      );
    }

    let data: Record<string, unknown>;

    try {
      const parsed: unknown =
        JSON.parse(event.payload);

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        throw new Error('Invalid payload');
      }

      data = parsed as Record<
        string,
        unknown
      >;
    } catch {
      throw new BadRequestException(
        'Invalid payment event payload.',
      );
    }

    if (
      data.provider !== 'SIMULATED' ||
      typeof data.providerEventId !== 'string' ||
      !data.providerEventId ||
      data.providerEventId.length > 255 ||
      typeof data.providerAttemptRef !== 'string' ||
      !data.providerAttemptRef ||
      data.providerAttemptRef.length > 255 ||
      typeof data.amount !== 'string' ||
      !/^\d{1,8}\.\d{2}$/.test(data.amount) ||
      data.currency !== 'ILS' ||
      typeof data.occurredAt !== 'string'
    ) {
      throw new BadRequestException(
        'Invalid payment event fields.',
      );
    }

    if (
      data.outcome !== 'SUCCEEDED' &&
      data.outcome !== 'FAILED' &&
      data.outcome !== 'UNKNOWN'
    ) {
      throw new BadRequestException(
        'Invalid payment outcome.',
      );
    }

    const occurredAt = new Date(
      data.occurredAt,
    );

    if (
      !Number.isFinite(
        occurredAt.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Invalid payment event timestamp.',
      );
    }

    return {
      provider: this.name,

      providerEventId:
        data.providerEventId,

      providerAttemptRef:
        data.providerAttemptRef,

      outcome:
        data.outcome,

      amount:
        data.amount,

      currency:
        data.currency,

      occurredAt,

      failureCode:
        typeof data.failureCode === 'string'
          ? data.failureCode.slice(0, 100)
          : undefined,
    };
  }
}