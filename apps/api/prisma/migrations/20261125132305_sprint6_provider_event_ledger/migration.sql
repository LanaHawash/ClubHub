BEGIN;

CREATE TYPE "PaymentProviderEventStatus" AS ENUM (
    'RECEIVED',
    'APPLIED',
    'IGNORED',
    'RECONCILIATION_REQUIRED'
);

CREATE TABLE "PaymentProviderEvent" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerEventId" VARCHAR(255) NOT NULL,
    "paymentAttemptId" UUID NOT NULL,
    "outcome" VARCHAR(30) NOT NULL,

    "status" "PaymentProviderEventStatus"
        NOT NULL DEFAULT 'RECEIVED',

    "payloadDigest" VARCHAR(64) NOT NULL,

    "providerOccurredAt" TIMESTAMPTZ(6) NOT NULL,

    "receivedAt" TIMESTAMPTZ(6)
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "processedAt" TIMESTAMPTZ(6),

    "processingNote" VARCHAR(255),

    CONSTRAINT "PaymentProviderEvent_pkey"
        PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX
    "PaymentProviderEvent_provider_providerEventId_key"
ON "PaymentProviderEvent" (
    "provider",
    "providerEventId"
);

CREATE INDEX
    "PaymentProviderEvent_paymentAttemptId_receivedAt_idx"
ON "PaymentProviderEvent" (
    "paymentAttemptId",
    "receivedAt"
);

CREATE INDEX
    "PaymentProviderEvent_status_receivedAt_idx"
ON "PaymentProviderEvent" (
    "status",
    "receivedAt"
);

ALTER TABLE "PaymentProviderEvent"
ADD CONSTRAINT
    "PaymentProviderEvent_paymentAttemptId_fkey"
FOREIGN KEY ("paymentAttemptId")
REFERENCES "PaymentAttempt"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "PaymentProviderEvent"
ADD CONSTRAINT "s6_provider_event_online_provider"
CHECK (
    "provider" IN (
        'SIMULATED',
        'REAL_GATEWAY'
    )
);

ALTER TABLE "PaymentProviderEvent"
ADD CONSTRAINT "s6_provider_event_outcome_check"
CHECK (
    "outcome" IN (
        'SUCCEEDED',
        'FAILED',
        'UNKNOWN'
    )
);

COMMIT;