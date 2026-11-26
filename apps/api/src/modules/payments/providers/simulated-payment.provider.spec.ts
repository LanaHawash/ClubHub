import {
  UnauthorizedException,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  SimulatedPaymentProvider,
} from './simulated-payment.provider';

describe('Sprint 6.E - Simulated payment provider', () => {
  let provider: SimulatedPaymentProvider;

  const occurredAt = new Date(
    '2026-11-25T10:00:00.000Z',
  );

  beforeEach(() => {
    const config = new ConfigService({
      SIMULATED_PAYMENT_WEBHOOK_SECRET:
        'test-only-payment-secret-at-least-32-characters',
    });

    provider =
      new SimulatedPaymentProvider(config);
  });

  it('generates deterministic provider references', async () => {
    const input = {
      paymentId: 'payment-1',

      attemptId: 'attempt-1',

      idempotencyKey: 'key-1',

      amount: '30.00',

      currency: 'ILS',

      nominalDeadlineAt:
        new Date('2026-11-25T11:00:00Z'),

      processingGraceEndsAt:
        new Date('2026-11-25T11:30:00Z'),
    };

    const first =
      await provider.initiatePayment(input);

    const second =
      await provider.initiatePayment(input);

    expect(first).toEqual(second);

    expect(first.status).toBe(
      'PROCESSING',
    );

    expect(first.provider).toBe(
      'SIMULATED',
    );
  });

  it('verifies a correctly signed success event', () => {
    const event =
      provider.createSignedEvent({
        providerAttemptRef:
          'sim-attempt-1',

        outcome: 'SUCCEEDED',

        amount: '30.00',

        currency: 'ILS',

        occurredAt,
      });

    const verified =
      provider.verifyEvent(event);

    expect(verified.outcome).toBe(
      'SUCCEEDED',
    );

    expect(verified.amount).toBe(
      '30.00',
    );

    expect(verified.currency).toBe(
      'ILS',
    );

    expect(verified.occurredAt).toEqual(
      occurredAt,
    );

    expect(
      verified.providerEventId,
    ).toBeTruthy();
  });

  it('verifies a correctly signed failed payment', () => {
    const event =
      provider.createSignedEvent({
        providerAttemptRef:
          'sim-attempt-1',

        outcome: 'FAILED',

        amount: '30.00',

        currency: 'ILS',

        occurredAt,

        failureCode: 'SIMULATED_DECLINE',
      });

    const verified =
      provider.verifyEvent(event);

    expect(verified.outcome).toBe(
      'FAILED',
    );

    expect(verified.failureCode).toBe(
      'SIMULATED_DECLINE',
    );
  });

  it('supports an unknown payment outcome', () => {
    const event =
      provider.createSignedEvent({
        providerAttemptRef:
          'sim-attempt-1',

        outcome: 'UNKNOWN',

        amount: '30.00',

        currency: 'ILS',

        occurredAt,
      });

    expect(
      provider.verifyEvent(event).outcome,
    ).toBe('UNKNOWN');
  });

  it('rejects an invalid signature', () => {
    const event =
      provider.createSignedEvent({
        providerAttemptRef:
          'sim-attempt-1',

        outcome: 'SUCCEEDED',

        amount: '30.00',

        currency: 'ILS',

        occurredAt,
      });

    expect(() =>
      provider.verifyEvent({
        ...event,

        signature:
          '0'.repeat(64),
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects an amount modified after signing', () => {
    const event =
      provider.createSignedEvent({
        providerAttemptRef:
          'sim-attempt-1',

        outcome: 'SUCCEEDED',

        amount: '30.00',

        currency: 'ILS',

        occurredAt,
      });

    const modified =
      event.payload.replace(
        '30.00',
        '1.00',
      );

    expect(() =>
      provider.verifyEvent({
        payload: modified,

        signature:
          event.signature,
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a failed event changed to successful', () => {
    const event =
      provider.createSignedEvent({
        providerAttemptRef:
          'sim-attempt-1',

        outcome: 'FAILED',

        amount: '30.00',

        currency: 'ILS',

        occurredAt,
      });

    expect(() =>
      provider.verifyEvent({
        payload:
          event.payload.replace(
            'FAILED',
            'SUCCEEDED',
          ),

        signature:
          event.signature,
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a timestamp modified after signing', () => {
    const event =
      provider.createSignedEvent({
        providerAttemptRef:
          'sim-attempt-1',

        outcome: 'SUCCEEDED',

        amount: '30.00',

        currency: 'ILS',

        occurredAt,
      });

    expect(() =>
      provider.verifyEvent({
        payload:
          event.payload.replace(
            '2026-11-25',
            '2026-11-24',
          ),

        signature:
          event.signature,
      }),
    ).toThrow(UnauthorizedException);
  });
});