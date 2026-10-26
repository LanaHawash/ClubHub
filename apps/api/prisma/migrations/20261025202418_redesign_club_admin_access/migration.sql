/*
  Warnings:

  - You are about to drop the column `adminAccountId` on the `Club` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ClubAdminPosition" AS ENUM ('PRESIDENT', 'SECOND_ADMIN');

-- DropForeignKey
ALTER TABLE "Club" DROP CONSTRAINT "Club_adminAccountId_fkey";

-- DropIndex
DROP INDEX "Club_adminAccountId_key";

-- AlterTable
ALTER TABLE "Club" DROP COLUMN "adminAccountId";

-- CreateTable
CREATE TABLE "ClubAdminAssignment" (
    "id" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "position" "ClubAdminPosition" NOT NULL,
    "assignedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),
    "assignedById" UUID NOT NULL,
    "revokedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ClubAdminAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubAdminAssignment_clubId_revokedAt_idx" ON "ClubAdminAssignment"("clubId", "revokedAt");

-- CreateIndex
CREATE INDEX "ClubAdminAssignment_accountId_revokedAt_idx" ON "ClubAdminAssignment"("accountId", "revokedAt");

-- AddForeignKey
ALTER TABLE "ClubAdminAssignment" ADD CONSTRAINT "ClubAdminAssignment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAdminAssignment" ADD CONSTRAINT "ClubAdminAssignment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAdminAssignment" ADD CONSTRAINT "ClubAdminAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAdminAssignment" ADD CONSTRAINT "ClubAdminAssignment_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only one active administrator per position in each club
CREATE UNIQUE INDEX "ClubAdminAssignment_active_position_unique"
ON "ClubAdminAssignment" ("clubId", "position")
WHERE "revokedAt" IS NULL;

-- Prevent one student from holding both positions simultaneously
CREATE UNIQUE INDEX "ClubAdminAssignment_active_student_unique"
ON "ClubAdminAssignment" ("clubId", "accountId")
WHERE "revokedAt" IS NULL;

-- Ensure revocation records are complete
ALTER TABLE "ClubAdminAssignment"
ADD CONSTRAINT "ClubAdminAssignment_revocation_consistency"
CHECK (
    ("revokedAt" IS NULL AND "revokedById" IS NULL)
    OR
    ("revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL)
);