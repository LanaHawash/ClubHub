-- A student may administer only one club at a time.
-- Revoked assignments are excluded so historical records remain intact.

CREATE UNIQUE INDEX "ClubAdminAssignment_one_active_club_per_student"
ON "ClubAdminAssignment" ("accountId")
WHERE "revokedAt" IS NULL;