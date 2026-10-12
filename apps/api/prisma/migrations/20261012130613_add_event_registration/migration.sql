-- CreateEnum
CREATE TYPE "EventEligibility" AS ENUM ('ALL_STUDENTS', 'CLUB_MEMBERS');

-- CreateEnum
CREATE TYPE "EventRegistrationStatus" AS ENUM ('CONFIRMED', 'PENDING_PAYMENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventPaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'ILS',
ADD COLUMN     "eligibility" "EventEligibility" NOT NULL DEFAULT 'ALL_STUDENTS',
ADD COLUMN     "isFree" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "memberFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nonMemberFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "registrationDeadline" DATE,
ADD COLUMN     "registrationOpen" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "paymentStatus" "EventPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "amountDue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "registeredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventRegistration_eventId_status_idx" ON "EventRegistration"("eventId", "status");

-- CreateIndex
CREATE INDEX "EventRegistration_accountId_status_idx" ON "EventRegistration"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_accountId_key" ON "EventRegistration"("eventId", "accountId");

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
