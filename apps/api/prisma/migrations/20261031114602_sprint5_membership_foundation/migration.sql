-- CreateEnum
CREATE TYPE "MembershipRegistrationMode" AS ENUM ('ALWAYS_OPEN', 'WINDOWED');

-- CreateTable
CREATE TABLE "ClubMembershipSettings" (
    "id" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "registrationMode" "MembershipRegistrationMode" NOT NULL DEFAULT 'ALWAYS_OPEN',
    "pendingFirstTimeFee" DECIMAL(10,2) NOT NULL,
    "pendingRenewalFee" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ClubMembershipSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubMembershipFeeVersion" (
    "id" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "firstTimeFee" DECIMAL(10,2) NOT NULL,
    "renewalFee" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "effectiveAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ClubMembershipFeeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubRegistrationWindow" (
    "id" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "opensAt" TIMESTAMPTZ(6) NOT NULL,
    "closesAt" TIMESTAMPTZ(6) NOT NULL,
    "closedAt" TIMESTAMPTZ(6),
    "effectiveFeeVersionId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ClubRegistrationWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubMembershipSettings_clubId_key" ON "ClubMembershipSettings"("clubId");

-- CreateIndex
CREATE INDEX "ClubMembershipFeeVersion_clubId_effectiveAt_idx" ON "ClubMembershipFeeVersion"("clubId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ClubRegistrationWindow_clubId_opensAt_idx" ON "ClubRegistrationWindow"("clubId", "opensAt");

-- CreateIndex
CREATE INDEX "ClubRegistrationWindow_clubId_closesAt_idx" ON "ClubRegistrationWindow"("clubId", "closesAt");

-- AddForeignKey
ALTER TABLE "ClubMembershipSettings" ADD CONSTRAINT "ClubMembershipSettings_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembershipFeeVersion" ADD CONSTRAINT "ClubMembershipFeeVersion_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembershipFeeVersion" ADD CONSTRAINT "ClubMembershipFeeVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubRegistrationWindow" ADD CONSTRAINT "ClubRegistrationWindow_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubRegistrationWindow" ADD CONSTRAINT "ClubRegistrationWindow_effectiveFeeVersionId_fkey" FOREIGN KEY ("effectiveFeeVersionId") REFERENCES "ClubMembershipFeeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Sprint 5: Membership fee integrity
ALTER TABLE "ClubMembershipSettings"
ADD CONSTRAINT "membership_pending_first_fee_positive"
CHECK ("pendingFirstTimeFee" > 0);

ALTER TABLE "ClubMembershipSettings"
ADD CONSTRAINT "membership_pending_renewal_fee_positive"
CHECK ("pendingRenewalFee" > 0);

ALTER TABLE "ClubMembershipFeeVersion"
ADD CONSTRAINT "membership_effective_first_fee_positive"
CHECK ("firstTimeFee" > 0);

ALTER TABLE "ClubMembershipFeeVersion"
ADD CONSTRAINT "membership_effective_renewal_fee_positive"
CHECK ("renewalFee" > 0);

-- Registration windows must have a valid interval.
ALTER TABLE "ClubRegistrationWindow"
ADD CONSTRAINT "membership_window_valid_interval"
CHECK ("closesAt" > "opensAt");

-- Early closure must occur during the registration window.
ALTER TABLE "ClubRegistrationWindow"
ADD CONSTRAINT "membership_window_valid_closure"
CHECK (
    "closedAt" IS NULL
    OR (
        "closedAt" >= "opensAt"
        AND "closedAt" < "closesAt"
    )
);
-- Allow equality comparisons on UUID columns in GiST indexes.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping scheduled or active registration intervals.
-- Early closure reduces the effective occupied interval.
ALTER TABLE "ClubRegistrationWindow"
ADD CONSTRAINT "membership_window_no_overlap"
EXCLUDE USING gist (
    "clubId" WITH =,
    tstzrange(
        "opensAt",
        COALESCE("closedAt", "closesAt"),
        '[)'
    ) WITH &&
);
-- Required for composite foreign-key validation.
ALTER TABLE "ClubMembershipFeeVersion"
ADD CONSTRAINT "membership_fee_version_id_club_unique"
UNIQUE ("id", "clubId");

-- A window can only reference a fee version belonging to its club.
ALTER TABLE "ClubRegistrationWindow"
ADD CONSTRAINT "membership_window_fee_same_club"
FOREIGN KEY ("effectiveFeeVersionId", "clubId")
REFERENCES "ClubMembershipFeeVersion"("id", "clubId")
ON DELETE RESTRICT;
-- Effective fee snapshots are immutable.
CREATE OR REPLACE FUNCTION prevent_membership_fee_version_update()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        'Effective membership fee versions cannot be modified';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER membership_fee_version_immutable
BEFORE UPDATE OR DELETE ON "ClubMembershipFeeVersion"
FOR EACH ROW
EXECUTE FUNCTION prevent_membership_fee_version_update();
-- Protect closed registration windows and locked pricing.
CREATE OR REPLACE FUNCTION protect_membership_registration_window()
RETURNS trigger AS $$
BEGIN
    -- A historical window cannot be deleted.
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'Registration windows cannot be deleted; history must be preserved';
    END IF;

    -- Once a fee version is locked, it cannot be replaced.
    IF OLD."effectiveFeeVersionId" IS NOT NULL
       AND NEW."effectiveFeeVersionId"
           IS DISTINCT FROM OLD."effectiveFeeVersionId" THEN
        RAISE EXCEPTION
            'A registration window fee version cannot be changed after locking';
    END IF;

    -- An early-closed window cannot be reopened or modified.
    IF OLD."closedAt" IS NOT NULL THEN
        RAISE EXCEPTION
            'An early-closed registration window cannot be modified';
    END IF;

    -- A window that has reached its natural closing time
    -- cannot be extended or otherwise modified.
    IF OLD."closesAt" <= CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION
            'An expired registration window cannot be modified';
    END IF;

    -- Opening time is immutable after the window becomes active.
    IF OLD."opensAt" <= CURRENT_TIMESTAMP
       AND NEW."opensAt" IS DISTINCT FROM OLD."opensAt" THEN
        RAISE EXCEPTION
            'An active registration window opening time cannot be changed';
    END IF;
    -- Active windows may be extended, but never shortened.
    IF OLD."opensAt" <= CURRENT_TIMESTAMP
    AND NEW."closesAt" < OLD."closesAt" THEN
        RAISE EXCEPTION
            'An active registration window cannot be shortened';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER membership_registration_window_protection
BEFORE UPDATE OR DELETE ON "ClubRegistrationWindow"
FOR EACH ROW
EXECUTE FUNCTION protect_membership_registration_window();