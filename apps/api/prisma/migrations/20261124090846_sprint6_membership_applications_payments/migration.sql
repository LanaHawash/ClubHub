/*
  Warnings:

  
  - A unique constraint covering the columns `[membershipNumber]` on the table `Membership` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sourceApplicationId]` on the table `Membership` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sourcePaymentId]` on the table `Membership` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Membership` table without a default value. This is not possible if the table is not empty.

*/
BEGIN;
-- Sprint 6: Membership number sequence
CREATE SEQUENCE "membership_number_seq"
    AS BIGINT
    START WITH 1
    INCREMENT BY 1
    NO CYCLE;

-- Sprint 6: Generate unique readable membership numbers
CREATE OR REPLACE FUNCTION generate_membership_number()
RETURNS VARCHAR(50)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    sequence_value TEXT;
BEGIN
    sequence_value := nextval('membership_number_seq')::TEXT;

    RETURN 'CH-'
        || TO_CHAR(
            CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Hebron',
            'YYYY'
        )
        || '-'
        || LPAD(
            sequence_value,
            GREATEST(6, LENGTH(sequence_value)),
            '0'
        );
END;
$$;
-- CreateEnum
CREATE TYPE "MembershipApplicationKind" AS ENUM ('ORDINARY', 'BOARD_ONBOARDING');

-- CreateEnum
CREATE TYPE "MembershipFeeType" AS ENUM ('FIRST_TIME', 'RENEWAL');

-- CreateEnum
CREATE TYPE "MembershipApplicationStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('AWAITING_CASH', 'PROCESSING', 'CONFIRMED', 'FAILED', 'EXPIRED', 'REFUND_REQUIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'SIMULATED', 'REAL_GATEWAY');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('INITIATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'UNKNOWN', 'LATE_SUCCESS_REFUND_REQUIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BoardNominationStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'QUALIFIED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BoardNominationReason" AS ENUM ('NO_MEMBERSHIP', 'INSUFFICIENT_COVERAGE');

-- CreateEnum
CREATE TYPE "ApplicationEndReason" AS ENUM ('TIMEOUT', 'WINDOW_CLOSED', 'EARLY_WINDOW_CLOSE', 'POLICY_SWITCH', 'CLUB_ARCHIVED', 'NOMINATION_TIMEOUT', 'WITHDRAWN', 'PAYMENT_FAILED');

-- Extend existing Membership table safely
ALTER TABLE "Membership"
    ADD COLUMN "confirmedPaymentAt" TIMESTAMPTZ(6),
    ADD COLUMN "membershipNumber" VARCHAR(50)
        NOT NULL DEFAULT generate_membership_number(),
    ADD COLUMN "sourceApplicationId" UUID,
    ADD COLUMN "sourcePaymentId" UUID,
    ADD COLUMN "updatedAt" TIMESTAMPTZ(6);

-- Preserve historical membership timestamps
UPDATE "Membership"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

-- Enforce required updatedAt after backfill
ALTER TABLE "Membership"
    ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "MembershipApplication" (
    "id" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "kind" "MembershipApplicationKind" NOT NULL DEFAULT 'ORDINARY',
    "status" "MembershipApplicationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "boardNominationId" UUID,
    "feeType" "MembershipFeeType" NOT NULL,
    "quotedAmount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ILS',
    "feeVersionId" UUID NOT NULL,
    "registrationWindowId" UUID,
    "registrationModeAtSubmission" "MembershipRegistrationMode",
    "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentDeadlineAt" TIMESTAMPTZ(6) NOT NULL,
    "originalDeadlineAt" TIMESTAMPTZ(6) NOT NULL,
    "processingGraceEndsAt" TIMESTAMPTZ(6),
    "paidAt" TIMESTAMPTZ(6),
    "canceledAt" TIMESTAMPTZ(6),
    "endReason" "ApplicationEndReason",
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MembershipApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "membershipApplicationId" UUID,
    "eventRegistrationId" UUID,
    "method" "PaymentMethod" NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ILS',
    "referenceKey" UUID NOT NULL,
    "providerPaymentId" VARCHAR(255),
    "confirmedAt" TIMESTAMPTZ(6),
    "confirmedByAccountId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'INITIATED',
    "provider" "PaymentProvider" NOT NULL,
    "providerAttemptRef" VARCHAR(255),
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "initiatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nominalDeadlineAt" TIMESTAMPTZ(6) NOT NULL,
    "processingGraceEndsAt" TIMESTAMPTZ(6) NOT NULL,
    "providerEventAt" TIMESTAMPTZ(6),
    "receivedAt" TIMESTAMPTZ(6),
    "failureCode" VARCHAR(100),
    "failureMessageSafe" TEXT,
    "providerPayloadDigest" VARCHAR(255),
    "refundReference" VARCHAR(255),
    "resolvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardNomination" (
    "id" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "position" VARCHAR(100) NOT NULL,
    "proposedStartDate" DATE NOT NULL,
    "proposedEndDate" DATE NOT NULL,
    "nominatedById" UUID NOT NULL,
    "nominatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "BoardNominationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "reason" "BoardNominationReason" NOT NULL,
    "qualifiedAt" TIMESTAMPTZ(6),
    "expiredAt" TIMESTAMPTZ(6),
    "withdrawnAt" TIMESTAMPTZ(6),
    "boardAppointmentId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BoardNomination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipApplication_boardNominationId_key" ON "MembershipApplication"("boardNominationId");

-- CreateIndex
CREATE INDEX "MembershipApplication_studentId_clubId_status_idx" ON "MembershipApplication"("studentId", "clubId", "status");

-- CreateIndex
CREATE INDEX "MembershipApplication_clubId_status_paymentDeadlineAt_idx" ON "MembershipApplication"("clubId", "status", "paymentDeadlineAt");

-- CreateIndex
CREATE INDEX "MembershipApplication_registrationWindowId_status_idx" ON "MembershipApplication"("registrationWindowId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_referenceKey_key" ON "Payment"("referenceKey");

-- CreateIndex
CREATE INDEX "Payment_membershipApplicationId_status_idx" ON "Payment"("membershipApplicationId", "status");

-- CreateIndex
CREATE INDEX "Payment_eventRegistrationId_status_idx" ON "Payment"("eventRegistrationId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentAttempt_paymentId_status_idx" ON "PaymentAttempt"("paymentId", "status");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_processingGraceEndsAt_idx" ON "PaymentAttempt"("status", "processingGraceEndsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_provider_providerAttemptRef_key" ON "PaymentAttempt"("provider", "providerAttemptRef");

-- CreateIndex
CREATE UNIQUE INDEX "BoardNomination_boardAppointmentId_key" ON "BoardNomination"("boardAppointmentId");

-- CreateIndex
CREATE INDEX "BoardNomination_clubId_status_deadlineAt_idx" ON "BoardNomination"("clubId", "status", "deadlineAt");

-- CreateIndex
CREATE INDEX "BoardNomination_studentId_status_deadlineAt_idx" ON "BoardNomination"("studentId", "status", "deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_membershipNumber_key" ON "Membership"("membershipNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_sourceApplicationId_key" ON "Membership"("sourceApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_sourcePaymentId_key" ON "Membership"("sourcePaymentId");

-- CreateIndex
CREATE INDEX "Membership_clubId_studentId_activatedAt_expiresAt_idx" ON "Membership"("clubId", "studentId", "activatedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_sourceApplicationId_fkey" FOREIGN KEY ("sourceApplicationId") REFERENCES "MembershipApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_sourcePaymentId_fkey" FOREIGN KEY ("sourcePaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "UniversityStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_boardNominationId_fkey" FOREIGN KEY ("boardNominationId") REFERENCES "BoardNomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_feeVersionId_clubId_fkey" FOREIGN KEY ("feeVersionId", "clubId") REFERENCES "ClubMembershipFeeVersion"("id", "clubId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_registrationWindowId_fkey" FOREIGN KEY ("registrationWindowId") REFERENCES "ClubRegistrationWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_membershipApplicationId_fkey" FOREIGN KEY ("membershipApplicationId") REFERENCES "MembershipApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES "EventRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_confirmedByAccountId_fkey" FOREIGN KEY ("confirmedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNomination" ADD CONSTRAINT "BoardNomination_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNomination" ADD CONSTRAINT "BoardNomination_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "UniversityStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNomination" ADD CONSTRAINT "BoardNomination_nominatedById_fkey" FOREIGN KEY ("nominatedById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNomination" ADD CONSTRAINT "BoardNomination_boardAppointmentId_fkey" FOREIGN KEY ("boardAppointmentId") REFERENCES "BoardAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- =====================================================
-- SPRINT 6: DATABASE BUSINESS INTEGRITY CONSTRAINTS
-- =====================================================

-- Required for membership interval exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- =====================================================
-- 1. MEMBERSHIP APPLICATION CONSTRAINTS
-- =====================================================

-- Only one live application per student per club.
CREATE UNIQUE INDEX "s6_one_live_application_per_student_club"
ON "MembershipApplication" ("clubId", "studentId")
WHERE "status" IN (
    'PENDING_PAYMENT',
    'PAYMENT_PROCESSING'
);

-- Membership application amounts must be positive.
ALTER TABLE "MembershipApplication"
ADD CONSTRAINT "s6_application_positive_amount"
CHECK ("quotedAmount" > 0);

-- Membership fees use ILS.
ALTER TABLE "MembershipApplication"
ADD CONSTRAINT "s6_application_currency_ils"
CHECK ("currency" = 'ILS');

-- Ordinary applications cannot reference a nomination.
-- Board onboarding applications must reference a nomination.
ALTER TABLE "MembershipApplication"
ADD CONSTRAINT "s6_application_nomination_kind_check"
CHECK (
    (
        "kind" = 'ORDINARY'
        AND "boardNominationId" IS NULL
    )
    OR
    (
        "kind" = 'BOARD_ONBOARDING'
        AND "boardNominationId" IS NOT NULL
    )
);

-- Deadlines must follow submission.
ALTER TABLE "MembershipApplication"
ADD CONSTRAINT "s6_application_deadline_check"
CHECK (
    "paymentDeadlineAt" > "submittedAt"
    AND "originalDeadlineAt" > "submittedAt"
);


-- =====================================================
-- 2. PAYMENT CONSTRAINTS
-- =====================================================

-- A payment must belong to exactly one target.
ALTER TABLE "Payment"
ADD CONSTRAINT "s6_payment_exactly_one_target"
CHECK (
    num_nonnulls(
        "membershipApplicationId",
        "eventRegistrationId"
    ) = 1
);

-- Payment amounts must be positive.
ALTER TABLE "Payment"
ADD CONSTRAINT "s6_payment_positive_amount"
CHECK ("amount" > 0);

-- Sprint 6 payments use ILS.
ALTER TABLE "Payment"
ADD CONSTRAINT "s6_payment_currency_ils"
CHECK ("currency" = 'ILS');

-- Only one confirmed payment per membership application.
CREATE UNIQUE INDEX "s6_one_confirmed_membership_payment"
ON "Payment" ("membershipApplicationId")
WHERE "status" = 'CONFIRMED'
AND "membershipApplicationId" IS NOT NULL;

-- Only one active logical payment per membership application.
CREATE UNIQUE INDEX "s6_one_live_membership_payment"
ON "Payment" ("membershipApplicationId")
WHERE "status" IN (
    'AWAITING_CASH',
    'PROCESSING'
)
AND "membershipApplicationId" IS NOT NULL;

-- In-person payments use the manual provider.
-- Online payments use a supported online provider.
ALTER TABLE "Payment"
ADD CONSTRAINT "s6_payment_method_provider_check"
CHECK (
    (
        "method" = 'IN_PERSON'
        AND "provider" = 'MANUAL'
    )
    OR
    (
        "method" = 'ONLINE'
        AND "provider" IN (
            'SIMULATED',
            'REAL_GATEWAY'
        )
    )
);

-- Confirmed payments require a confirmation timestamp.
-- Cash requires an identifiable human confirmer.
ALTER TABLE "Payment"
ADD CONSTRAINT "s6_payment_confirmation_check"
CHECK (
    "status" <> 'CONFIRMED'
    OR
    (
        "confirmedAt" IS NOT NULL
        AND
        (
            (
                "method" = 'IN_PERSON'
                AND "confirmedByAccountId" IS NOT NULL
            )
            OR
            (
                "method" = 'ONLINE'
                AND "confirmedByAccountId" IS NULL
            )
        )
    )
);


-- =====================================================
-- 3. ONLINE PAYMENT ATTEMPT CONSTRAINTS
-- =====================================================

-- Only one unresolved attempt per logical payment.
CREATE UNIQUE INDEX "s6_one_unresolved_payment_attempt"
ON "PaymentAttempt" ("paymentId")
WHERE "status" IN (
    'INITIATED',
    'PROCESSING',
    'UNKNOWN'
);

-- Online attempts cannot use the manual provider.
ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "s6_attempt_online_provider_check"
CHECK (
    "provider" IN (
        'SIMULATED',
        'REAL_GATEWAY'
    )
);

-- Attempts must begin before their nominal deadline.
ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "s6_attempt_deadline_check"
CHECK (
    "initiatedAt" < "nominalDeadlineAt"
    AND "processingGraceEndsAt" >= "nominalDeadlineAt"
);


-- =====================================================
-- 4. BOARD NOMINATION CONSTRAINTS
-- =====================================================

-- Only one active nomination per student per club.
CREATE UNIQUE INDEX "s6_one_live_board_nomination"
ON "BoardNomination" ("clubId", "studentId")
WHERE "status" IN (
    'PENDING_PAYMENT',
    'PAYMENT_PROCESSING'
);

-- Proposed board dates must be ordered correctly.
ALTER TABLE "BoardNomination"
ADD CONSTRAINT "s6_nomination_date_order"
CHECK (
    "proposedEndDate" >= "proposedStartDate"
);

-- Nomination deadline must be exactly 72 hours.
ALTER TABLE "BoardNomination"
ADD CONSTRAINT "s6_nomination_72_hour_deadline"
CHECK (
    "deadlineAt" = "nominatedAt" + INTERVAL '72 hours'
);

-- A qualified nomination must have an official appointment.
-- Other nominations must not reference an official appointment.
ALTER TABLE "BoardNomination"
ADD CONSTRAINT "s6_nomination_qualification_check"
CHECK (
    (
        "status" = 'QUALIFIED'
        AND "boardAppointmentId" IS NOT NULL
        AND "qualifiedAt" IS NOT NULL
    )
    OR
    (
        "status" <> 'QUALIFIED'
        AND "boardAppointmentId" IS NULL
        AND "qualifiedAt" IS NULL
    )
);


-- =====================================================
-- 5. MEMBERSHIP CONSTRAINTS
-- =====================================================

-- Membership expiration must follow activation.
ALTER TABLE "Membership"
ADD CONSTRAINT "s6_membership_valid_interval"
CHECK (
    "expiresAt" > "activatedAt"
);

-- Historical memberships may have neither source.
-- New payment-backed memberships must have both.
ALTER TABLE "Membership"
ADD CONSTRAINT "s6_membership_source_pair"
CHECK (
    (
        "sourceApplicationId" IS NULL
        AND "sourcePaymentId" IS NULL
    )
    OR
    (
        "sourceApplicationId" IS NOT NULL
        AND "sourcePaymentId" IS NOT NULL
        AND "confirmedPaymentAt" IS NOT NULL
    )
);

-- Membership intervals for the same student and club
-- cannot overlap.
ALTER TABLE "Membership"
ADD CONSTRAINT "s6_membership_no_overlapping_intervals"
EXCLUDE USING gist (
    "clubId" WITH =,
    "studentId" WITH =,
    tstzrange(
        "activatedAt",
        "expiresAt",
        '[)'
    ) WITH &&
);
COMMIT;