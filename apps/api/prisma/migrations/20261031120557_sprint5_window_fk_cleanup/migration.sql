-- Sprint 5: Align registration-window foreign keys
-- with the Prisma composite relationship.

-- Remove the redundant single-column foreign key.
ALTER TABLE "ClubRegistrationWindow"
DROP CONSTRAINT IF EXISTS "ClubRegistrationWindow_effectiveFeeVersionId_fkey";

-- Remove the existing composite FK so its name can be
-- aligned with Prisma's expected constraint name.
ALTER TABLE "ClubRegistrationWindow"
DROP CONSTRAINT IF EXISTS "membership_window_fee_same_club";

-- Restore the composite foreign key.
-- A registration window must reference a fee version
-- belonging to the same club.
ALTER TABLE "ClubRegistrationWindow"
ADD CONSTRAINT "ClubRegistrationWindow_effectiveFeeVersionId_clubId_fkey"
FOREIGN KEY ("effectiveFeeVersionId", "clubId")
REFERENCES "ClubMembershipFeeVersion"("id", "clubId")
ON DELETE RESTRICT
ON UPDATE CASCADE;