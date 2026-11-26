export type OnlinePaymentProviderName =
  | 'SIMULATED'
  | 'REAL_GATEWAY';

export type ProviderPaymentOutcome =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNKNOWN';

export interface InitiateProviderPaymentInput {
  paymentId: string;
  attemptId: string;

  idempotencyKey: string;

  amount: string;
  currency: string;

  nominalDeadlineAt: Date;
  processingGraceEndsAt: Date;
}

export interface InitiateProviderPaymentResult {
  provider: OnlinePaymentProviderName;

  providerPaymentId: string;
  providerAttemptRef: string;

  status: 'PROCESSING';
}

export interface VerifiedProviderPaymentEvent {
  provider: OnlinePaymentProviderName;

  providerEventId: string;
  providerAttemptRef: string;

  outcome: ProviderPaymentOutcome;

  amount: string;
  currency: string;

  occurredAt: Date;

  failureCode?: string;
}

export interface SignedProviderPaymentEvent {
  payload: string;
  signature: string;
}

export interface OnlinePaymentProvider {
  readonly name: OnlinePaymentProviderName;

  initiatePayment(
    input: InitiateProviderPaymentInput,
  ): Promise<InitiateProviderPaymentResult>;

  verifyEvent(
    event: SignedProviderPaymentEvent,
  ): VerifiedProviderPaymentEvent;
}

export const ONLINE_PAYMENT_PROVIDER = Symbol(
  'ONLINE_PAYMENT_PROVIDER',
);