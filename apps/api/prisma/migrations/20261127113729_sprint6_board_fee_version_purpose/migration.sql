BEGIN;

CREATE TYPE "MembershipFeeVersionPurpose" AS ENUM (
    'STANDARD',
    'BOARD_ONBOARDING'
);

ALTER TABLE "ClubMembershipFeeVersion"
ADD COLUMN "purpose" "MembershipFeeVersionPurpose"
NOT NULL DEFAULT 'STANDARD';

COMMIT;